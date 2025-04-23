import { split } from "sentence-splitter";
import { RemindersTextResponse, RemindersTextResponseData, User } from "../shared/types";
import { isValidSentence, getSelectedPhraseAndSentence } from "../shared/utils";
import { registerHandler, addMessageListener, HandlerMap, sendToBackground } from "../shared/messages";
import { addReminderPopoverToTextNode } from "./reminder_popup";


class DynamicDOMManager {
  private sentence2textNode: Map<string, Text[]> = new Map() // key: sentence, value: textNode that contains the sentence
  private textNode2status: Map<Text, boolean> = new Map() // key: textNode, value: if this textNode is already processed
  private textNode2highlightPopover: Map<Text, HTMLDivElement[]> = new Map() // key: textNode, value: highlight and popover that are created for this textNode
  private ignoredTags = ["script", "style", "noscript", "iframe", "a", "button", "input"];
  private requestInterval = 1000; // 1s
  private allowRequest = true; 
  private pendingRequestTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: MutationObserver;
  private shadowContainer: HTMLDivElement;

  constructor(private rootNode: Node) {

  }

  public start(){
    this.initCss()

    this.handleMutationNodes(this.rootNode, "add");

    this.pendingRequestTimer = setTimeout(async()=>{
          await this.getRemindersTextFromServer();
        }, this.requestInterval)
        
    this.observeDOMChanges();
    
  }

  private initCss(){
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    if (!document.body.parentNode) return;

    document.body.parentNode.appendChild(shadowHost);

    // Hide the host div
    shadowHost.style.width = "0";
    shadowHost.style.height = "0";
    shadowHost.style.visibility = "hidden";

    // create a container inside the Shadow DOM
    const shadowContainer = document.createElement("div");
    shadowRoot.appendChild(shadowContainer);

    // Manually inject Tippy.js CSS inside the Shadow DOM
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL("assets/content-css.css");
    
    shadowRoot.appendChild(style);
    this.shadowContainer = shadowContainer;
  }

  private handleMutationNodes(rootNode: Node, action: string) {
    if(this.shouldIgnoreNode(rootNode)) return;

    if (rootNode.nodeType === Node.TEXT_NODE) {
      if (action === "add") this.addTextNode(rootNode as Text);
      else this.removeTextNode(rootNode as Text);
    }
    else if (rootNode.nodeType === Node.ELEMENT_NODE) {
      const treeWalker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_ELEMENT,
        (node) => { 
          if(this.shouldIgnoreNode(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      );
      while (treeWalker.nextNode()) {
        for (const node of treeWalker.currentNode.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (action === "add") this.addTextNode(node as Text);
            else this.removeTextNode(node as Text);
          }
        }
      }
    }
  }

  private shouldIgnoreNode(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE){
      const parentElement = node.parentElement;
      return parentElement?.closest(this.ignoredTags.map(tag => tag.toLowerCase()).join(',')) !== null;
        
    }
    else if (node.nodeType === Node.ELEMENT_NODE){
      return (node as Element).closest(this.ignoredTags.map(tag => tag.toLowerCase()).join(',')) !== null; 
    }
    return true;
  }

  private addTextNode(node: Text) {
    if (!node.textContent || node.textContent.trim()==="") return;
    this.textNode2status.set(node, false);
    // console.log("ADD: "); 
    // console.log(node.parentElement);
  }

  private removeTextNode(node: Text) {
    if (!node.textContent || node.textContent.trim()==="") return;
    this.textNode2status.delete(node);

    const highlightPopoverArr = this.textNode2highlightPopover.get(node);
    if (highlightPopoverArr){
      highlightPopoverArr.forEach((highlightPopover) => {
        this.shadowContainer.removeChild(highlightPopover);
      });
    }
    this.textNode2highlightPopover.delete(node);

    // console.log("Remove: "); 
    // console.log(node.parentElement);
  }

  // Observe DOM changes using MutationObserver
  private observeDOMChanges() {
    this.observer = new MutationObserver((mutations) => {
      // add or remove text nodes
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => this.handleMutationNodes(node, "add"));
          mutation.removedNodes.forEach((node) => this.handleMutationNodes(node, "remove"));
        }
        else if (mutation.type === 'attributes') {
          this.handleMutationNodes(mutation.target, "add");
        }
        else if (mutation.type === 'characterData'){
          this.handleMutationNodes(mutation.target, "add");
        }
      }

      // If timeout is already set
      if (this.pendingRequestTimer === null){
        this.pendingRequestTimer = setTimeout(async()=>{
          await this.getRemindersTextFromServer();
        }, this.requestInterval)
      }
      
    });

    this.observer.observe(this.rootNode, { childList: true, subtree: true, characterData: true, attributes: true,  attributeFilter: ["style", "class"],});
  }

  public async getSentences(): Promise<string[]> {
    // collect sentences that are newly added to the DOM tree.
    let currentSentence2TextNodes: Record<string, Text[]> = {};
    for (const [textNode, processed] of this.textNode2status){
      if (processed === true) continue;
      this.textNode2status.set(textNode, true);
      const text = textNode.textContent;

      if (text === null) continue;
      const textSentences = split(text).filter(el => el.type === 'Sentence').map(s => s.raw);
      
      for (const sentence of textSentences){
          if (isValidSentence(sentence) === false) continue;
          if (!currentSentence2TextNodes[sentence]){
            currentSentence2TextNodes[sentence] = [];
          }
          currentSentence2TextNodes[sentence].push(textNode)
      }
    }
    
    // update status on popup:
    const sentencesCount = Object.keys(currentSentence2TextNodes).length;
    if(sentencesCount===0) return[];
    await sendToBackground({action: "setLogInfo", data: `Info: Detected ${sentencesCount} sentences. Checking the cache...` })

    // get cached reminders for sentences if have
    const response = await sendToBackground({
      action: "getRemindersTextDataFromCache",
      data: Object.keys(currentSentence2TextNodes)
    });

    // update the status of the request
    if(response.status === "error"){
      await sendToBackground({action: "setLogInfo", data: "Error at getRemindersTextDataFromCache: " + response.error! })
      return[];
    }

    const remindersTextResponseData: (RemindersTextResponseData|null)[] = response.data!;

    let result: string[] = [];
    const hasRemindersSentencesLen = remindersTextResponseData.reduce((sum, obj) => {
      if (!obj || obj.reminders_data.length===0) return sum;
      return sum + 1;
    }, 0);
    const remindersCount = remindersTextResponseData.reduce((sum, obj) => {
      if (!obj || obj.reminders_data.length===0) return sum;
      return sum + obj.reminders_data.length;
    }, 0);
    await sendToBackground({action: "setLogInfo", data: `Info: From cache, ${hasRemindersSentencesLen} sentences includes reminders, and there are ${remindersCount} reminders in total.` })

      
    //put sentences which already have reminders in cache on screen, and return those do not.
    Object.entries(currentSentence2TextNodes).forEach(([sentence, textNodes], index) => {
      if(remindersTextResponseData[index] && remindersTextResponseData[index]?.reminders_data.length>0){
        for(const textNode of textNodes){
          if (this.textNode2status.get(textNode) === true) 
            addReminderPopoverToTextNode(textNode, remindersTextResponseData[index], this.shadowContainer, this.textNode2highlightPopover);
        }
      }
      else{
        if(!this.sentence2textNode.has(sentence)){
          this.sentence2textNode.set(sentence,[]);
          result.push(sentence); // this sentence shows up for the first time, so send to the server.
        }
        this.sentence2textNode.get(sentence)!.push(...textNodes);
      }
    });

    return result;
  }

  private async getRemindersTextFromServer(){
    // request is not allowed now, wait till the next cycle
    if (!this.allowRequest){
      this.pendingRequestTimer = setTimeout(async()=>{
        await this.getRemindersTextFromServer();
      }, this.requestInterval)
      return;
    }

    this.allowRequest = false;
    this.pendingRequestTimer = null; // Reset timer

    await this.f();

    this.allowRequest = true;
  } 

  private async f(){
    // get sentences on the website
    const sentences = await this.getSentences();
    if (sentences.length === 0) return;
    console.log("Sentences taken");
    console.log(sentences);

    // send sentences to the server and get reminders
    await sendToBackground({action: "setLogInfo", data: `Info: Sending ${sentences.length} sentences to the server...` })
    const remindersTextresponse: RemindersTextResponse = await sendToBackground({ 
      action: "getRemindersTextFromServer", 
      data: {user_id: user.id, 
        reading_languages: user.reading_languages, 
        learning_languages: user.learning_languages, 
        reminding_language: user.reminding_language!, 
        free_llm: user.free_llm!,
        sentences: sentences}
    });

    // update status of the request on popup
    if (remindersTextresponse.status === "error"){
      await sendToBackground({action: "setLogInfo", data: "Error at getRemindersTextFromServer: " + remindersTextresponse.error! })
      return;
    } 
    else{
      const hasRemindersSentencesLen = remindersTextresponse.data!.length
      const remindersCount = remindersTextresponse.data!.reduce((sum, obj) => sum + obj.reminders_data.length, 0);
      await sendToBackground({action: "setLogInfo", data: `Info: From server, ${hasRemindersSentencesLen} sentences includes reminders, and there are ${remindersCount} reminders in total.` })
    }
    
    // put up on screen
    for (const remindersSentenceData of remindersTextresponse.data!){
      const sentence = remindersSentenceData.sentence;
      const textNodeArray = this.sentence2textNode.get(sentence);
      for (const textNode of textNodeArray!){
        if (this.textNode2status.get(textNode) === true) {
          addReminderPopoverToTextNode(textNode, remindersSentenceData, this.shadowContainer, this.textNode2highlightPopover);
        }
      }
    }

    //cache
    const remindersTextresponseData = remindersTextresponse.data!;
    //add sentence without reminders in cache
    const hasRemindersSentences = new Set(remindersTextresponseData.map(item => item.sentence));
    for (const sentence of sentences){
      if(!hasRemindersSentences.has(sentence)){
        remindersTextresponseData.push({sentence: sentence, reminders_data: []})
      }
    }
    const setCacheRes = await sendToBackground({action: "setRemindersTextDataIntoCache", data: remindersTextresponseData})
    if (setCacheRes.status === "error"){
      sendToBackground({action: "setLogInfo", data: "Error at setRemindersTextDataIntoCache: " + setCacheRes.error! })
      return;
    } 
    

  }
}


const handlers: HandlerMap = {};

registerHandler(
  "getSelectedPhrase",
  async () => {
    const getUserRes = await sendToBackground({action: "getUser"})
    if (getUserRes.status === "error"){
      return {status: "error", "error": "Login required!"};
    }

    const user = getUserRes.data!;
    const {phrase, phraseIdx, sentence} = getSelectedPhraseAndSentence();
    return {status: "success", data: {user_id: user.id, phrase: phrase, phrase_idx: phraseIdx, sentence: sentence }};
  },
  handlers
);

addMessageListener(handlers)
let dynamicDOMManager = new DynamicDOMManager(document.body);
let user: User;
(async () => {
  const res = await sendToBackground({action: "getUser"})
  const web_url = window.location.href; 
  if(res.status === "success"){
    user = res.data!;
    if (!user.free_llm || !user.reminding_language || user.learning_languages.length===0 || user.reading_languages.length===0){
      await sendToBackground({action: "setLogInfo", data: `Warning: Please set up free_llm, reminding_language, learning_languages, and reading_languages` })
    }
    else if (user.unallowed_urls.includes(web_url)){
      await sendToBackground({action: "setLogInfo", data: "Warning: Vocab Reminder is not allowed to work on this website."})
    }
    else{
      dynamicDOMManager.start();
    }  
  }
  else{
    await sendToBackground({action: "setLogInfo", data: "Error at getUser: " + res.error! })
  }
})();
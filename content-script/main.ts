import { split } from "sentence-splitter";
import { RemindersTextResponse, RemindersSentenceData } from "../shared/types";
import { isValidSentence, getSelectedPhraseAndSentence } from "../shared/utils";
import { addReminderPopoverToTextNode } from "./reminder_popup";

class DynamicDOMManager {
  private sentence2textNode: Map<string, Text[]> = new Map() // key: sentence, value: textNode that contains the sentence
  private textNode2status: Map<Text, boolean> = new Map() // key: textNode, value: if this textNode is already processed
  private textNode2highlightPopover: Map<Text, HTMLDivElement[]> = new Map() // key: textNode, value: highlight and popover that are created for this textNode
  private ignoredTags = ["script", "style", "noscript", "iframe", "a", "button", "input"];
  private requestInterval = 1000; // 1s
  private allowRequest = true; 
  private pendingRequestTimer : number | null = null; 
  private allowedLanguages: string[];
  private observer: MutationObserver;
  private shadowContainer: HTMLDivElement;

  constructor(private rootNode: Node) {
    this.allowedLanguages = ["vie", "eng"];
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

  private sendMessageBackground(message: object): Promise<any> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            resolve(response);
        });
    });
  }

  public async getSentences(): Promise<string[]> {
    let currentSentence2TextNodes: Record<string, Text[]> = {};
    for (const [textNode, processed] of this.textNode2status){
      if (processed === true) continue;
      this.textNode2status.set(textNode, true);
      const text = textNode.textContent;

      if (text === null) continue;
      const textSentences = split(text).filter(el => el.type === 'Sentence').map(s => s.raw);
      
      for (const sentence of textSentences){
          if (isValidSentence(sentence, this.allowedLanguages) === false) continue;
          if (!currentSentence2TextNodes[sentence]){
            currentSentence2TextNodes[sentence] = [];
          }
          currentSentence2TextNodes[sentence].push(textNode)
      }
    }
    
    const response = await this.sendMessageBackground({
      action: "getRemindersTextDataFromCache",
      sentences: Object.keys(currentSentence2TextNodes)
    });

    if(response.status === "error"){
      throw new Error(response.error);
    }

    const remindersSentenceDataBatch: (RemindersSentenceData|null)[] = response.data;

    let result: string[] = [];

    Object.entries(currentSentence2TextNodes).forEach(([sentence, textNodes], index) => {
      if(remindersSentenceDataBatch[index]){
        for(const textNode of textNodes){
          if (this.textNode2status.get(textNode) === true) 
            addReminderPopoverToTextNode(textNode, remindersSentenceDataBatch[index], this.shadowContainer, this.textNode2highlightPopover);
        }
        console.log("UP: " + sentence, textNodes)
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
    const sentences = await this.getSentences();
    if (sentences.length === 0) return;
    console.log("Sentences taken");
    console.log(sentences);
    const remindersTextresponse: RemindersTextResponse = await this.sendMessageBackground({ action: "getRemindersTextFromServer", data: sentences});
    
    if (!remindersTextresponse || remindersTextresponse.status === "error") return;

    console.log("Put these up: ", remindersTextresponse.data);

    for (const remindersSentenceData of remindersTextresponse.data!){
      const sentence = remindersSentenceData.sentence;
      const textNodeArray = this.sentence2textNode.get(sentence);
      if (!textNodeArray){
        console.log("Error: Can not find in sentence2textNode the sentence: ", sentence)
        continue;
      } 
      for (const textNode of textNodeArray){
        if (this.textNode2status.get(textNode) === true) {
          addReminderPopoverToTextNode(textNode, remindersSentenceData, this.shadowContainer, this.textNode2highlightPopover);
        }
      }
    }

  }

  public log(status:string, message: string ){
    console.log(status);
    console.log(message);
  }
}


let dynamicDOMManager = new DynamicDOMManager(document.body);
dynamicDOMManager.start();

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.action === "getSelectedPhrase") {
    try {
      const selectedPhraseData = getSelectedPhraseAndSentence();
      sendResponse({status: "success", data: selectedPhraseData})
    } catch (error) {
      sendResponse({status: "error", error: error})
      dynamicDOMManager.log("Log Error: ", error instanceof Error ? error.message : String(error))
    }
    
    return true
  }
  else if (message.action === "logError"){
    dynamicDOMManager.log("Log Error: ", message.message)
  }
  else if (message.action === "logSuccess"){
    dynamicDOMManager.log("Log Success: ", message.message)
  }
  else{

  }
});

chrome.runtime.sendMessage({ action: "getUser" }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("Error:", chrome.runtime.lastError.message);
    return;
  }
  console.log("Response from background:", response);
});
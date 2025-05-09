import { split } from "sentence-splitter";
import { ReminderTextResponseData, RemindersTextResponseCache } from "../shared/types";
import { isValidSentence, getSelectedPhraseAndSentence } from "../shared/utils";
import { registerHandler, addMessageListener, HandlerMap, sendToBackground, removeMessageListener } from "../shared/messages";
import { addReminderPopoverToTextNode } from "./reminder-popover";
import { addPopover, updatePopoverContent } from "./popover";

const clientURL = import.meta.env.VITE_CLIENT_URL

class DynamicDOMManager {
  private sentence2textNode: Map<string, Text[]> = new Map() // key: sentence, value: textNode that contains the sentence
  private textNode2status: Map<Text, boolean> = new Map() // key: textNode, value: if this textNode is already processed
  private textNode2highlightPopover: Map<Text, HTMLDivElement[]> = new Map() // key: textNode, value: highlight and popover that are created for this textNode
  private ignoredTags = ["script", "style", "noscript", "iframe", "a", "button", "input"];
  private requestInterval = 1000; // 1s
  private allowRequest = true; 
  private pendingRequestTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: MutationObserver;
  private shadowContainer!: HTMLDivElement;
  private trackedSentences: Set<string> = new Set(); // sentences being tracked in the DOM tree, not yet sent to the server.
  private sentSentences: Set<string> = new Set() // sentences that are already sent to the server and waiting for reminders.
  private requestID = 1;
  
  constructor(private rootNode: Node) {
    this.observer = new MutationObserver((mutations) => {
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

      this.setPendingRequestTimer()
    });


    this.initCss()


  }

  private initCss(){
    const shadowHost = document.createElement("div");
    shadowHost.id = "vocab-reminder-shadow-host"
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

  private setPendingRequestTimer(){
    if (this.pendingRequestTimer !== null) return;

    this.pendingRequestTimer = setTimeout(
      async()=>{
        this.pendingRequestTimer = null;
        await this.getRemindersText();
      }, 
      this.requestInterval)
  }

  public start(){
    this.handleMutationNodes(this.rootNode, "add");

    this.setPendingRequestTimer();
        
    this.observeDOMChanges();
    
  }

  private handleMutationNodes(rootNode: Node, action: string) {
    const dfs = (node: Node) => {
      if (this.shouldIgnoreNode(node)) return;
  
      if (node.nodeType === Node.TEXT_NODE) {
        if (action === "add") this.addTextNode(node as Text);
        else this.removeTextNode(node as Text);
      }
  
      // Recurse into children if element
      else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of node.childNodes) {
          dfs(child);
        }
      }
    };
  
    dfs(rootNode);
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
  }

  // Observe DOM changes using MutationObserver
  private observeDOMChanges() {
    this.observer.observe(this.rootNode, { childList: true, subtree: true, characterData: true, attributes: true,  attributeFilter: ["style", "class"],});
  }

  public getSentences(): Record<string, Text[]> {
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

    return currentSentence2TextNodes;
  }

  private setRequestLock(){
    this.allowRequest = false;
  }

  public releaseRequestLock(){
    this.allowRequest = true;
  }

  private isRequestLock(){
    return !this.allowRequest;
  }

  private async getRemindersTextFromCache(currentSentence2TextNodes: Record<string, Text[]>){
    const sentences = Object.keys(currentSentence2TextNodes);

    // get cached reminders for sentences if have
    const response = await sendToBackground({
      action: "getRemindersTextDataFromCache",
      data: sentences
    });

    // update the status of the request
    if(response.status === "error"){
      await sendToBackground({action: "setLogInfo", data: "Error at getRemindersTextDataFromCache: " + response.error! })
      return[];
    }

    const remindersTextResponseCache: RemindersTextResponseCache = response.data!;

    let result: string[] = [];
    let cachedSentencesCount = 0;
    let cachedRemindersCount = 0;
    for (const [_, value] of Object.entries(remindersTextResponseCache)) {
      cachedSentencesCount++;
      if (value.length > 0) {
        cachedRemindersCount += value.length;
      }
    }
    await sendToBackground({action: "setLogInfo", data: `Info: From cache, ${cachedSentencesCount} sentences includes reminders, and there are ${cachedRemindersCount} reminders in total.` })

      
    //put sentences which already have reminders in cache on screen, and return those do not.
    for (const sentence of sentences){
      const textNodes = currentSentence2TextNodes[sentence];
      if(sentence in remindersTextResponseCache){
        if (remindersTextResponseCache[sentence].length==0) continue;
        for(const textNode of textNodes){
          if (this.textNode2status.get(textNode) === true) { // check if textNode data mutation not happened
            for (const reminderSentenceData of remindersTextResponseCache[sentence]){
              addReminderPopoverToTextNode(textNode, reminderSentenceData, this.shadowContainer, this.textNode2highlightPopover);
            }
          }
        }
      }
      else{
        if(!this.sentence2textNode.has(sentence)){
          this.sentence2textNode.set(sentence,[]);
          result.push(sentence); // this sentence shows up for the first time, so send to the server.
        }
        this.sentence2textNode.get(sentence)!.push(...textNodes);
      }
    }
    return result
  }

  private async getRemindersText(){
    // check if user is logged in
    const authRes = await checkAuth();
    if (authRes.status === "error"){
      this.trackedSentences.clear() // clear all tracked text nodes so far
      return;
    } 
        
    // track newly added sentences on DOM and show reminders for sentences that are already in cache.
    const currentSentence2TextNodes = this.getSentences();
    const sentencesCount = Object.keys(currentSentence2TextNodes).length
    if(sentencesCount === 0) return;
    await sendToBackground({action: "setLogInfo", data: `Info: Detected ${sentencesCount} sentences. Checking the cache...` })

    const sentencesWithoutReminders = await this.getRemindersTextFromCache(currentSentence2TextNodes);
    if (sentencesWithoutReminders.length === 0)return;
    await sendToBackground({action: "setLogInfo", data: `Info: ${sentencesWithoutReminders.length} sentences will be sent to the server`})

    sentencesWithoutReminders.forEach(item => this.trackedSentences.add(item));

    //if the previous request is not done, wait till the next cycle.
    if (this.isRequestLock()){
      this.setPendingRequestTimer(); 
      return;
    }

    this.setRequestLock() // from now on, no request is allowed.

    // send sentences to the server
    this.sentSentences = new Set(this.trackedSentences); 
    this.trackedSentences.clear(); 

    await sendToBackground({action: "setLogInfo", data: `Info: The request ${this.requestID} sending ${this.sentSentences.size} sentences to the server...` })
    const user = authRes.data!;
    const getRemindersTextResponse = await sendToBackground({ 
      action: "getRemindersTextFromServer", 
      data: {
        request_id: this.requestID,
        user_id: user.id, 
        reading_languages: user.reading_languages, 
        learning_languages: user.learning_languages, 
        llm_response_language: user.llm_response_language!, 
        sentences: Array.from(this.sentSentences)
      }
    });
  
    if(getRemindersTextResponse.status === "error"){
      await sendToBackground({action: "setLogInfo", data: "Error at getRemindersTextFromServer: " + getRemindersTextResponse.error! })
      this.renewRequestID();
      this.releaseRequestLock() // release the request lock
    } 
    return;
  }

  public async showRemindersTextData(ReminderTextResponseData: ReminderTextResponseData){
    const {is_final, reminders_text_data} = ReminderTextResponseData;

    // put up on screen
    for (const reminderData of reminders_text_data){
      const sentence = reminderData.sentence;
      const textNodeArray = this.sentence2textNode.get(sentence);
      this.sentSentences.delete(sentence); 
      for (const textNode of textNodeArray!){
        if (this.textNode2status.get(textNode) === true) {
          addReminderPopoverToTextNode(textNode, reminderData, this.shadowContainer, this.textNode2highlightPopover);
        }
      }
    }

    //cache
    const setCacheRes = await sendToBackground({action: "setRemindersTextDataIntoCache", data: reminders_text_data})
    if (setCacheRes.status === "error"){
      sendToBackground({action: "setLogInfo", data: "Error at setRemindersTextDataIntoCache: " + setCacheRes.error! })
      return;
    } 

    // for sentences that are sent to the server but do not receive reminders, we need to put them in the cache as well.
    if (!is_final) return;
    const setCacheResNoReminder = await sendToBackground({
      action: "setRemindersTextDataIntoCache", 
      data: Array.from(this.sentSentences).map((sentence) => ({
        sentence,
        word: "",                     
        word_idx: -1,                 
        related_phrase: "",
        related_phrase_sentence: "",
        reminder: "",
      }))
    })

    if (setCacheResNoReminder.status === "error"){
      await sendToBackground({action: "setLogInfo", data: "Error at setRemindersTextDataIntoCacheNoReminder: " + setCacheResNoReminder.error! })
      return;
    }
    await sendToBackground({action: "setLogInfo", data: `Info: The request ${this.requestID} is done. Ready to start a new one.`})
    
    this.renewRequestID();
    this.sentSentences.clear();
    this.releaseRequestLock();
  }

  public getShadowContainer(){
    return this.shadowContainer;
  }

  public removeShadowRoot(){
    const shadowHost = document.getElementById("vocab-reminder-shadow-host");
    if (shadowHost && shadowHost.parentNode) {
      shadowHost.parentNode.removeChild(shadowHost);
    }
  }

  public renewRequestID(){
    this.requestID++;
  }
}


async function checkAuth(){
  const res = await sendToBackground({action: "getUser"})
  if(res.status === "success"){
    const user = res.data!;
    if (!user.llm_response_language || user.learning_languages.length===0 || user.reading_languages.length===0){
      await sendToBackground({action: "setLogInfo", data: `Warning: Please go to ${clientURL}/dashboard/account set up llm response language, learning languages, and reading languages` })
      return {status: "error"}
    }

    const web_url = window.location.href; 
    for (const blockedUrl of user.unallowed_urls) {
      if (web_url.startsWith(blockedUrl)) {
        await sendToBackground({
          action: "setLogInfo",
          data: "Warning: Vocab Reminder is not allowed to work on this website."
        });
        return {status: "error"};
      }
    }

    return {status: "success", data: user};
  }
  else{
    await sendToBackground({action: "setLogInfo", data: "Error at getUser: " + res.error! })
    return {status: "error"};
  }
}

function setupMessageHandler(dynamicDOMManager: DynamicDOMManager){
  const handlers: HandlerMap = {};

  registerHandler(
    "getSelectedPhrase",
    async () => {
      const {phrase, phraseIdx, sentence} = getSelectedPhraseAndSentence();
      return {status: "success", data: {phrase: phrase, phrase_idx: phraseIdx, sentence: sentence }};
    },
    handlers
  );

  registerHandler(
    "preSelectPhrase",
    async (textContent) => {
      const {phrase, phraseIdx, sentence, range} = getSelectedPhraseAndSentence();
      const shadowContainer = dynamicDOMManager.getShadowContainer()
      const popoverId = addPopover(textContent, range, shadowContainer)
      return {status: "success", data: {phrase: phrase, phrase_idx: phraseIdx, sentence: sentence, popoverId: popoverId}};
    },
    handlers
  );

  registerHandler(
    "afterSelectPhrase",
    async ({popoverId, textContent}) => {
      const shadowContainer = dynamicDOMManager.getShadowContainer()
      const popover = shadowContainer.querySelector(`#${popoverId}`) as HTMLDivElement;
      if(!popover) return {status: "error", error: "popover not found"}
      updatePopoverContent(popover ,textContent)
      return {status: "success"};
    },
    handlers
  );

  registerHandler(
    "receiveRemindersTextFromServer",
    async (remindersTextData) => {
      dynamicDOMManager.showRemindersTextData(remindersTextData);
      return {status: "success"};
    },
    handlers
  )

  registerHandler(
    "releaseLock",
    async () => {
      dynamicDOMManager.renewRequestID();
      dynamicDOMManager.releaseRequestLock();
      return {status: "success"};
    },
    handlers
  )

  const msgListener = addMessageListener(handlers)
  return msgListener
}

// avoid "extension context invalidated" error when extension reload, upgrade, install
function setupOrphanProtection(dynamicDOMManager: DynamicDOMManager){
  const onMouseMove = (_event: MouseEvent) => {
    if (unregisterOrphan()) {
      return;
    }
    // Your logic here if needed while still active
  };

  const unregisterOrphan = () => {
    if (chrome.runtime.id) {
      // Still connected to the extension
      return false;
    }

    // if this content script is now orphaned

    // remove all listener
    window.removeEventListener(orphanMessageId, unregisterOrphan);
    document.removeEventListener('mousemove', onMouseMove);
    removeMessageListener(msgListener)
    
    // clean up
    dynamicDOMManager.removeShadowRoot()
    return true;
  };


  const orphanMessageId = chrome.runtime.id + 'orphanCheck';

  window.dispatchEvent(new Event(orphanMessageId));
  window.addEventListener(orphanMessageId, unregisterOrphan);
  (window as any).running = true;

  document.addEventListener('mousemove', onMouseMove);

  const msgListener = setupMessageHandler(dynamicDOMManager)
  
} 

async function main(){
  await sendToBackground({
    action: "deleteLogInfo"
  });

  await sendToBackground({
    action: "setLogInfo",
    data: "Start!!!"
  });
  

  const dynamicDOMManager = new DynamicDOMManager(document.body);

  const authRes = await checkAuth();
  if (authRes.status === "error") return;
  
  setupOrphanProtection(dynamicDOMManager)
  dynamicDOMManager.start();
}

main()
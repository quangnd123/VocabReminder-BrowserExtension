import { ReminderCache } from "./reminders_cache";
import { registerHandler, sendToTab, addMessageListener, HandlerMap, BaseResponse } from "../shared/messages";
import { createPhrase, getRemindersText, fetchUserSession, translatePhrase } from "../shared/requests";

const handlers: HandlerMap = {};
const tabsInfo: Map<number, [Date,string][]> = new Map();
const clientURL = import.meta.env.VITE_CLIENT_URL

// modify the right-click menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "createPhrase",
    title: "Store this vocab",
    contexts: ["selection"], // Only show when text is highlighted
  });

  chrome.contextMenus.create({
    id: "translatePhrase",
    title: "Translate with AI",
    contexts: ["selection"], // Only show when text is highlighted
  });

  chrome.alarms.create("dailyReminderClear", {
    periodInMinutes: 1440, // 1440 minutes = 24 hours
  });
});

// When the alarm triggers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyReminderClear") {
    ReminderCache.clear();
  }
});

// users click on store phrase
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  const tabId = tab.id;

  if (info.menuItemId === "createPhrase") {
    // check user llm and translate_language
    const getUserResponse = await fetchUserSession();
    if (getUserResponse.status === "error"){
      await sendToTab(tabId,{ action: "preSelectPhrase", data: `Error: Please login at ${clientURL}/login`});
      return;
    }
    const user = getUserResponse.data!;
    
    const preTranslatePhraseResponse = await sendToTab(tabId,{ action: "preSelectPhrase", data: "Adding vocab ..." });
    if (preTranslatePhraseResponse.status === "error"){
      setLogInfo(tabId, "Error at preSelectPhrase: " + preTranslatePhraseResponse.error!)
      return;
    } 
    const {phrase, phrase_idx, sentence, popoverId} = preTranslatePhraseResponse.data!
    const createPhraseResponse = await createPhrase({phrase: phrase, phrase_idx: phrase_idx, sentence: sentence , user_id: user.id});
    if (createPhraseResponse.status==="success"){
      await sendToTab(tabId,{ action: "afterSelectPhrase", data: {popoverId: popoverId, textContent: "Success: Vocab added!"}})
    }
    else{
      await sendToTab(tabId,{ action: "afterSelectPhrase", data: {popoverId: popoverId, textContent: "Error: " + createPhraseResponse.error!}})
    }
  } 
  else if (info.menuItemId === "translatePhrase"){
    // check user llm and translate_language
    const getUserResponse = await fetchUserSession();
    if (getUserResponse.status === "error"){
      await sendToTab(tabId,{ action: "preSelectPhrase", data: `Error: Please login at ${clientURL}/login`});
      return;
    }
    const user = getUserResponse.data!;
    if(!user.llm_response_language){
      await sendToTab(tabId,{ action: "preSelectPhrase", data: `Error: Please go to ${clientURL}/dashboard/account and choose a llm response language!`});
      return;
    }

    const preTranslatePhraseResponse = await sendToTab(tabId,{ action: "preSelectPhrase", data: "Translating phrase ..." });
    if (preTranslatePhraseResponse.status === "error"){
      setLogInfo(tabId, "Error at preSelectPhrase: " + preTranslatePhraseResponse.error!)
      return;
    } 
    const {phrase, phrase_idx, sentence, popoverId} = preTranslatePhraseResponse.data!
    const translatePhraseResponse = await translatePhrase({phrase: phrase, phrase_idx: phrase_idx, sentence: sentence, translate_language: user.llm_response_language, user_id: user.id})
    if (translatePhraseResponse.status==="success"){
      await sendToTab(tabId,{ action: "afterSelectPhrase", data: {popoverId: popoverId, textContent: translatePhraseResponse.data!}})
    }
    else{
      await sendToTab(tabId,{ action: "afterSelectPhrase", data: {popoverId: popoverId, textContent: "Error: " + translatePhraseResponse.error!}})
    }
  } 
});

registerHandler(
  "getRemindersTextFromServer",
  async (req) => {
    const res = await getRemindersText(req);
    if (res.status === "success") {
      await ReminderCache.setBatch(res.data!);
    }
    return res;
  },
  handlers
);

registerHandler(
  "getUser",
  async () => {
    const res = await fetchUserSession();
    return res;
  },
  handlers
);

registerHandler(
  "getRemindersTextDataFromCache",
  async (sentences) => {
    const res = await ReminderCache.getBatch(sentences);
    return {status: "success", data: res};;
  },
  handlers
);

registerHandler(
  "setRemindersTextDataIntoCache",
  async (req) => {
    await ReminderCache.setBatch(req);
    return {status: "success"};;
  },
  handlers
);

async function setLogInfo(tabId: number, info: string): Promise<BaseResponse<null>> {
  if(!tabsInfo.has(tabId)){
    tabsInfo.set(tabId, [])
  }
  tabsInfo.get(tabId)!.push([new Date(), info]);
  return {status: "success"};
}

registerHandler(
  "setLogInfo",
  async function setLogInfo(info, sender){
    if(!sender?.tab?.id) return({status: "error", error: "Cannot identify tabId to log info"})
    if(!tabsInfo.has(sender.tab.id)){
      tabsInfo.set(sender.tab.id, [])
    }
    tabsInfo.get(sender.tab.id)!.push([new Date(), info]);
    return {status: "success"};
  },
  handlers
);

registerHandler(
  "getLogInfo",
  async (tabId)=>{
    if (tabsInfo.has(tabId))
      return {status: "success", data: tabsInfo.get(tabId)}
    return {status: "success", data: []}
  },
  handlers
);


addMessageListener(handlers)
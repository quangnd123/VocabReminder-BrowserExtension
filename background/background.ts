import { ReminderCache } from "./reminders_cache";
import { registerHandler, sendToTab, addMessageListener, HandlerMap, BaseResponse } from "../shared/messages";
import { createPhrase, getRemindersText, fetchUserSession } from "../shared/requests";

const handlers: HandlerMap = {};
const tabsInfo: Map<number, [Date,string][]> = new Map();
console.log(tabsInfo)
// modify the right-click menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "createPhrase",
    title: "Store highlighted text to the vocab database",
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
    const response = await sendToTab(tabId,{ action: "getSelectedPhrase" });
    if (response.status === "error"){
      setLogInfo(tabId, "Error at getSelectedPhrase: " + response.error!)
      return;
    } 
    const createPhraseResponse = await createPhrase(response.data!);
    if(createPhraseResponse.status === "success"){
      setLogInfo(tabId, "Success: Phrase Added!")
    }
    else{
      setLogInfo(tabId, "Error at createPhrase: " + createPhraseResponse.error!)
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
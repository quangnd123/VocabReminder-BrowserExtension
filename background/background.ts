import { ReminderCache } from "./reminders_cache";
import { TabInfoCache } from "./tabs-info";
import { registerHandler, sendToTab, addMessageListener, HandlerMap, BaseResponse } from "../shared/messages";
import { createPhrase, fetchUserSession, translatePhrase } from "../shared/requests";
import { RemindersTextRequest, RemindersTextResponse } from "../shared/types";
import { waitForSocketOpen } from "../shared/utils";

const handlers: HandlerMap = {};
const clientURL = import.meta.env.VITE_CLIENT_URL
const server_reminder_text_socket_url = import.meta.env.VITE_SERVER_REMINDER_TEXT_SOCKET_URL
let socket: WebSocket | null = null;
initWebSocket()

chrome.runtime.onInstalled.addListener(async () => {
  // auto inject the script into all current webs if reload/install/upgrade the extension
  // const manifest = chrome.runtime.getManifest();

  // for (const cs of manifest.content_scripts ?? []) {
  //   const tabs = await chrome.tabs.query({ url: cs.matches });

  //   for (const tab of tabs) {
  //     if (!tab.id || !tab.url || tab.url.startsWith("chrome://")) continue;

  //     try {
  //       const target: chrome.scripting.InjectionTarget = {
  //         tabId: tab.id,
  //         allFrames: cs.all_frames ?? false,
  //       };

  //       // Inject JS
  //       if (cs.js && cs.js.length > 0) {
  //         await chrome.scripting.executeScript({
  //           target: target,
  //           files: cs.js,
  //           injectImmediately: cs.run_at === 'document_start', // optional
  //         });
  //       }

  //       // Inject CSS
  //       if (cs.css && cs.css.length > 0) {
  //         await chrome.scripting.insertCSS({
  //           target: target,
  //           files: cs.css,
  //         });
  //       }
  //     } catch (e) {
  //       console.warn(`Failed to inject into tab ${tab.id}:`, e);
  //     }
  //   }
  // }
  

  // modify the right-click menu
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

// When a tab is closed
chrome.tabs.onRemoved.addListener((tabId, _) => {
  TabInfoCache.delete(tabId);
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

function initWebSocket(){
  try {
    socket = new WebSocket(server_reminder_text_socket_url);

    socket.onopen = () => {
    };

    socket.onmessage = async (event) => {
      const remindersTextResponse: RemindersTextResponse = typeof event.data === "string"
        ? JSON.parse(event.data)
        : event.data;

      if (remindersTextResponse.status === "error") {
        await sendToTab(remindersTextResponse.data!.tab_id!, {action: "releaseLock"})
        setLogInfo(remindersTextResponse.data?.tab_id!, "Error in getRemindersTextFromServer: " + remindersTextResponse.error);
        return;
      }

      const { tab_id, reminders_text_data } = remindersTextResponse.data!;
      await sendToTab(tab_id, { action: "receiveRemindersTextFromServer", data: remindersTextResponse.data! });

      const info = `Received ${reminders_text_data.length} reminders text from server\n` +
        reminders_text_data.map((item) =>
          `Sentence: ${item.sentence}, Word: ${item.word}, Reminder: ${item.reminder}`
        ).join("\n");

      setLogInfo(tab_id, info);
    };

    socket.onclose = () => {
      socket = null;
    };

    socket.onerror = (err) => {
      const errorEvent = err as ErrorEvent;
      setLogInfo(-1, "WebSocket error: " + (errorEvent.message || "Unknown error"));
    };
  } catch (error) {
    setLogInfo(-1, "Error in initWebSocket: " + error);
  }
}

registerHandler(
  "getRemindersTextFromServer",
  async (req, sender) => {
    const tab_id = sender.tab!.id!;
    const getRemindersTextFromServerRequest: RemindersTextRequest={tab_id , ...req}
    if (!socket){
      return {status: "error", error: "WebSocket failed to connect"};
    }
    await waitForSocketOpen(socket)
    socket.send(JSON.stringify(getRemindersTextFromServerRequest));
    return {status: "success"};
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
  await TabInfoCache.save(tabId, [new Date(), info]);
  return {status: "success"};
}

registerHandler(
  "setLogInfo",
  async function setLogInfo(info, sender){
    if(!sender?.tab?.id) return({status: "error", error: "Cannot identify tabId to log info"})
    await TabInfoCache.save(sender.tab.id, [new Date(), info]);
    return {status: "success"};
  },
  handlers
);

registerHandler(
  "getLogInfo",
  async (tabId)=>{
    const data = await TabInfoCache.get(tabId);
    return {status: "success", data: data};
  },
  handlers
);

registerHandler(
  "deleteLogInfo",
  async (_, sender)=>{
    if(!sender?.tab?.id) return({status: "error", error: "Cannot identify tabId to log info"})
    await TabInfoCache.delete(sender.tab.id);
    return {status: "success"};
  },
  handlers
);

addMessageListener(handlers)
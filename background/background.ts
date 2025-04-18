import { RemindersTextRequest, RemindersTextResponse, CreatePhraseRequest, CreatePhraseResponse } from "../shared/types";
import { toCamelCase, toSnakeCase } from "../shared/utils";
import { ReminderCache } from "./reminders_cache";
import dotenv from 'dotenv'

dotenv.config()

async function fetchUserSession(){
  const response = await fetch(`${process.env.CLIENT_URL}/api/auth/check-session`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const dataResponse = await response.json();
  return dataResponse
}


async function requestGetRemindersText(remindersTextRequest: RemindersTextRequest){
    const response = await fetch(`${process.env.SERVER_URL}/reminders-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSnakeCase(remindersTextRequest)),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const responseJson = await response.json()
    const responseData: RemindersTextResponse = await toCamelCase(responseJson);
    return responseData;
}

async function requestCreatePhrase(createPhraseRequest: CreatePhraseRequest){
    const response = await fetch(`${process.env.SERVER_URL}/create-phrase`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(toSnakeCase((createPhraseRequest))),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const responseJson = await response.json()
    const responseData: CreatePhraseResponse = await toCamelCase(responseJson);
    return responseData;
}

ReminderCache.initialize();

// modify the right-click menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "createPhrase",
    title: "Store highlighted text to the vocab database",
    contexts: ["selection"], // Only show when text is highlighted
  });
});



// users click on store phrase
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  const tabId = tab.id;

  if (info.menuItemId === "createPhrase") {
    chrome.tabs.sendMessage(tabId, { action: "getSelectedPhrase" }, async (response)=>{
      if (response.status === "error") return;
      try {
        const createPhraseResponse = await requestCreatePhrase(response.data);
        if(createPhraseResponse.status === "success"){
          chrome.tabs.sendMessage(tabId, {action: "logSuccess", message: "Phrase added!" + response.data})
        }
        else{
          chrome.tabs.sendMessage(tabId, {action: "logError", message: createPhraseResponse.error})
        }
        console.log(createPhraseResponse)
      } catch (error) {
        chrome.tabs.sendMessage(tabId, {action: "logError", message: error instanceof Error ? error.message : String(error)})
      }
    })
  } 
});


// background onMessage
chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.action === "getRemindersTextFromServer") {
    (async () => {
      try {
        const requestGetRemindersTextResponse = await requestGetRemindersText({ sentences: message.data });

        if (requestGetRemindersTextResponse.status === "success") {
          await ReminderCache.setBatch(requestGetRemindersTextResponse.data!);
          sendResponse({ status: "success", data: requestGetRemindersTextResponse.data });
        } else {
          sendResponse({ status: "error", error: requestGetRemindersTextResponse.error });
        }
      } catch (error) {
        sendResponse({ status: "error", error: error instanceof Error ? error.message : String(error)});
      }
    })();

    return true; // ✅ Keeps the background script alive until `sendResponse` is called
  }

  else if (message.action === "getRemindersTextDataFromCache") {
    (async () => {
      try {
        const remindersSentenceDataBatch = await ReminderCache.getBatch(message.sentences);
        sendResponse({ status: "success", data: remindersSentenceDataBatch });
      } catch (error) {
        sendResponse({ status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    })();
    
    return true; // ✅ Keeps the background script alive until `sendResponse` is called
  }
  else if (message.action === "getUser"){
    (async () => {
      try {
        const data = await fetchUserSession();
        sendResponse({ status: "success", data: data });
      } catch (error) {
        sendResponse({ status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    })();
    
    return true;
  }
});

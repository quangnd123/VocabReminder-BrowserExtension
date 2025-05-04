import { User, ReminderTextResponseData, RemindersTextRequestCache, RemindersTextResponseCache} from "./types";

interface ActionMap {
  getUser: {
    input_type: void;
    output_type: User;
  };
  getSelectedPhrase:{
    input_type: void;
    output_type: {  
      phrase: string
      phrase_idx: number
      sentence: string
    };
  }
  getRemindersTextFromServer:{
    input_type: {
      request_id: number;
      user_id: string;
      reading_languages: string[];
      llm_response_language: string;
      learning_languages: string[];
      sentences: string[];
    };
    output_type: void;
  };
  receiveRemindersTextFromServer:{
    input_type: ReminderTextResponseData;
    output_type: void;
  }
  getRemindersTextDataFromCache:{
    input_type: string[];
    output_type: RemindersTextResponseCache;
  }
  setRemindersTextDataIntoCache:{
    input_type: RemindersTextRequestCache;
    output_type: void;
  }
  setLogInfo:{
    input_type: string;
    output_type: void;
  }
  getLogInfo:{
    input_type: number
    output_type: [Date, string][]
  }
  deleteLogInfo:{
    input_type: void
    output_type: void
  }
  preSelectPhrase:{
    input_type: string // textContent
    output_type: {
      popoverId: string
      phrase: string
      phrase_idx: number
      sentence: string
    } 
  }
  afterSelectPhrase:{
    input_type: {
      popoverId: string
      textContent: string
    }
    output_type: void
  }
  releaseLock:{
    input_type: void
    output_type: void
  }
  // Add more actions here...
}

type Message<A extends keyof ActionMap> = {
  action: A;
  data?: ActionMap[A]["input_type"];
};

export type BaseResponse<T> = {
  status: "success" | "error";
  data?: T;
  error?: string;
};

type Handler<A extends keyof ActionMap> = (
  input: ActionMap[A]["input_type"],
  sender: chrome.runtime.MessageSender
) => Promise<BaseResponse<ActionMap[A]["output_type"]>>;

export async function sendToBackground<A extends keyof ActionMap>(
  msg: Message<A>
): Promise<BaseResponse<ActionMap[A]["output_type"]>> {
  return new Promise((resolve) => {
    try {
      if (!chrome.runtime?.id) {
        // Context is invalid (extension probably reloaded)
        return resolve({
          status: "error",
          error: "Extension context invalidated (runtime.id is undefined)",
        });
      }

      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          return resolve({
            status: "error",
            error: chrome.runtime.lastError.message,
          });
        }
        resolve(response as BaseResponse<ActionMap[A]["output_type"]>);
      });
    } catch (e) {
      resolve({
        status: "error",
        error: (e as Error).message,
      });
    }
  });
}

export async function sendToTab<A extends keyof ActionMap>(
  tabId: number,
  msg: Message<A>
): Promise<BaseResponse<ActionMap[A]["output_type"]>> {
  return new Promise((resolve) => {
    try {
      if (!chrome.runtime?.id) {
        // Context is invalid (extension probably reloaded)
        return resolve({
          status: "error",
          error: "Extension context invalidated (runtime.id is undefined)",
        });
      }
      
      chrome.tabs.sendMessage(tabId, msg, (response) => {
        if (chrome.runtime.lastError) {
          return resolve({
            status: "error",
            error: chrome.runtime.lastError.message,
          });
        }
        resolve(response as BaseResponse<ActionMap[A]["output_type"]>);
      });
    } catch (e) {
      resolve({
        status: "error",
        error: (e as Error).message,
      });
    }
  });
}

export type HandlerMap = {
  [A in keyof ActionMap]?: Handler<A>;
};

export function registerHandler<A extends keyof ActionMap>(
  action: A,
  handler: Handler<A>,
  handlers: HandlerMap
) {
  handlers[action] = handler as HandlerMap[A];
}

export function addMessageListener(handlers: HandlerMap) {
  const listener = (
    message: Message<keyof ActionMap>, 
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    const handler = handlers[message.action] as Handler<any>;
    if (!handler) return;

    (async () => {
      try {
        const response = await handler(message.data, sender);
        sendResponse(response);
      } catch (error) {
        sendResponse({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return true;
  }

  chrome.runtime.onMessage.addListener(listener);
  return listener;
}

export function removeMessageListener(
  listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0]
) {
  chrome.runtime.onMessage.removeListener(listener);
}
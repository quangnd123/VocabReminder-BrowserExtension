import { User, CreatePhraseRequest, RemindersTextRequest, RemindersTextResponseData} from "./types";

interface ActionMap {
  getUser: {
    input_type: void;
    output_type: User;
  };
  getSelectedPhrase:{
    input_type: void;
    output_type: CreatePhraseRequest;
  }
  getRemindersTextFromServer:{
    input_type: RemindersTextRequest;
    output_type: RemindersTextResponseData[];
  };
  getRemindersTextDataFromCache:{
    input_type: string[];
    output_type: (RemindersTextResponseData|null)[];
  }
  setRemindersTextDataIntoCache:{
    input_type: RemindersTextResponseData[];
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
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        return resolve({
          status: "error",
          error: chrome.runtime.lastError.message,
        });
      }
      resolve(response as BaseResponse<ActionMap[A]["output_type"]>);
    });
  });
}

export async function sendToTab<A extends keyof ActionMap>(
  tabId: number,
  msg: Message<A>
): Promise<BaseResponse<ActionMap[A]["output_type"]>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        return resolve({
          status: "error",
          error: chrome.runtime.lastError.message,
        });
      }
      resolve(response as BaseResponse<ActionMap[A]["output_type"]>);
    });
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
  chrome.runtime.onMessage.addListener(
    (message: Message<keyof ActionMap>, sender, sendResponse) => {
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
  );
}


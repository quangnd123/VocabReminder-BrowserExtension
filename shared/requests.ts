import { RemindersTextRequest, RemindersTextResponse, CreatePhraseRequest, CreatePhraseResponse, AuthResponse, TranslatePhraseRequest, TranslatePhraseResponse } from "./types";

const clientURL = import.meta.env.VITE_CLIENT_URL
const serverURL = import.meta.env.VITE_SERVER_URL

async function postRequest<TRequest, TResponse>(
    path: string,
    body: TRequest
  ): Promise<TResponse> {
    try {
      const res = await fetch(`${serverURL}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
  
      return await res.json();
    } catch (error) {
      return {
        status: "error",
        error: (error as Error).message ?? "Unknown error occurred",
        data: null,
      } as TResponse;
    }
}

async function getRequest<TResponse>(to: string ,path: string): Promise<TResponse> {
  try {
    const base = to === "client" ? clientURL : serverURL;
    const res = await fetch(`${base}/${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errorData = await res.json();
      return {
        status: "error",
        error: errorData?.error || `HTTP error! status: ${res.status}`,
        data: null,
      } as TResponse;
    }

    return await res.json();
  } catch (error) {
    return {
      status: "error",
      error: (error as Error).message ?? "Unknown error occurred",
      data: null,
    } as TResponse;
  }
}



export function fetchUserSession(){
    return getRequest<AuthResponse>("client","api/auth/check-session");
}


export function getRemindersText(req: RemindersTextRequest): Promise<RemindersTextResponse>{
    return postRequest<RemindersTextRequest, RemindersTextResponse>("reminders-text", req);
}


export function createPhrase(req: CreatePhraseRequest): Promise<CreatePhraseResponse> {
    return postRequest<CreatePhraseRequest, CreatePhraseResponse>("create_phrase", req);
}

export function translatePhrase(req: TranslatePhraseRequest): Promise<TranslatePhraseResponse>{
  return postRequest<TranslatePhraseRequest, TranslatePhraseResponse>("translate_phrase", req)
}
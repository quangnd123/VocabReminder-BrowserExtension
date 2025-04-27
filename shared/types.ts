type BaseResponse<T> = {
  status: "success" | "error";
  error?: string;
  data?: T;
};

//----------------- PHRASE-----------------
export type PhraseData = {
  id: string
  phrase: string
  phrase_idx: number
  sentence: string
  language: string
}

export type CreatePhraseRequest = {
  user_id: string
  phrase: string
  phrase_idx: number
  sentence: string
}

export type CreatePhraseResponse = BaseResponse<PhraseData>

export type TranslatePhraseRequest = {
  user_id: string
  phrase: string
  phrase_idx: number
  sentence: string
  translate_language: string
}

export type TranslatePhraseResponse = BaseResponse<string>


//----------------- Reminders Text -----------------

export type RemindersTextRequest = {
  user_id: string;
  reading_languages: string[];
  llm_response_language: string;
  learning_languages: string[];
  sentences: string[];
};


export type RemindersTextResponseSentenceData = {
  word: string;
  word_idx: number;
  related_phrase: string;
  related_phrase_sentence: string;
  reminder: string;
};


export type RemindersTextResponseData = {
  sentence: string;
  reminders_data: RemindersTextResponseSentenceData[];
};


export type RemindersTextResponse = BaseResponse<RemindersTextResponseData[]>;


//----------------- Auth -----------------
export type User = {
  id: string;
  name: string | null;
  email: string | null;
  reading_languages: string[];
  learning_languages: string[];
  llm_response_language: string | null;
  unallowed_urls: string[];
}

export type AuthResponse = BaseResponse<User>
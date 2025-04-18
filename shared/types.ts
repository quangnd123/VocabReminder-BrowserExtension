export interface PhraseData {
  phrase: string;
  phraseIdx: number;
  sentence: string;
}

// ----------------- Request Models -----------------

export interface CreatePhraseRequest extends PhraseData {}

export interface RemindersTextRequest {
  sentences: string[]; // Mapping node_id to sentences
}

// ----------------- Response Models -----------------

type BaseResponse<T> = {
  status: "success" | "error";
  error?: string;
  data?: T;
};

export type CreatePhraseResponse = BaseResponse<null>; // No data needed

export type GetPhrasesResponse = BaseResponse<PhraseData[]>;

export interface ReminderSentenceData {
  word: string;
  wordIdx: number;
  relatedPhrase: string;
  relatedPhraseSentence: string;
  reminder: string;
}

export interface RemindersSentenceData{
  sentence: string
  remindersData: ReminderSentenceData[]
}

export type RemindersTextResponse = BaseResponse<RemindersSentenceData[]>;

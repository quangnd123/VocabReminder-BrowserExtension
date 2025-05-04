import { RemindersTextDataCache, RemindersTextRequestCache, RemindersTextResponseCache } from "../shared/types";

export class ReminderCache {
    private static STORAGE_KEY = "vocab_reminder_cache";
    private static MAX_STORAGE_SIZE = 4.5 * 1024 * 1024; // Set limit to 4.5MB (safe margin from 5MB)
    private static CLEANUP_BATCH_SIZE = 50; // Number of least used items to remove in cleanup

    static async getBatch(sentences: string[]) : Promise<RemindersTextResponseCache>{
      const cache = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
      const data: {[sentence: string]: { data: RemindersTextDataCache, lastAccessed: number }} = cache[ReminderCache.STORAGE_KEY] || {};

      let dataChanged = false;
      let result: RemindersTextResponseCache = {};
      for (const sentence of sentences){
        if (data[sentence]) {
          data[sentence].lastAccessed = Date.now(); // Update usage timestamp
          dataChanged = true;
          result[sentence] = data[sentence].data;
        }
      }
      
      if (dataChanged) await chrome.storage.local.set({ [ReminderCache.STORAGE_KEY]: data });
      return result;
    }

    static async setBatch(remindersTextRequestCache: RemindersTextRequestCache): Promise<void>{
      const cache = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
      let data = cache[ReminderCache.STORAGE_KEY] || {};

      for (const remindersTextSentenceData of remindersTextRequestCache){
        const now = Date.now();
        if (!remindersTextSentenceData.reminder){
          data[remindersTextSentenceData.sentence] = { data: [], lastAccessed: Date.now() };
          continue
        }
        
        if (!data[remindersTextSentenceData.sentence]) {
          data[remindersTextSentenceData.sentence] = { data: [remindersTextSentenceData], lastAccessed: now };
        }
        else{
          data[remindersTextSentenceData.sentence].lastAccessed = now;
          data[remindersTextSentenceData.sentence].data.push(remindersTextSentenceData)
        }
      }
      
      await chrome.storage.local.set({ [ReminderCache.STORAGE_KEY]: data });
      await ReminderCache.enforceSizeLimit();
    }
  
    // Remove a specific reminder
    static async remove(sentence: string): Promise<void> {
      const cache = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
      let data = cache[ReminderCache.STORAGE_KEY] || {};
  
      if (data[sentence]) {
        delete data[sentence];
        await chrome.storage.local.set({ [ReminderCache.STORAGE_KEY]: data });
      }
    }
  
    // Clear all reminders
    static async clear(): Promise<void> {
      await chrome.storage.local.remove(ReminderCache.STORAGE_KEY);
    }
  
    private static async enforceSizeLimit(attempt = 0): Promise<void> {
      if (attempt > 5) return; // prevent infinite recursion
    
      const usage = await chrome.storage.local.getBytesInUse(ReminderCache.STORAGE_KEY);
      if (usage <= ReminderCache.MAX_STORAGE_SIZE) return;
    
      const storedData = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
      let data: { [sentence: string]: {data: RemindersTextDataCache; lastAccessed: number } } = storedData[ReminderCache.STORAGE_KEY] || {};
    
      const sortedEntries = Object.entries(data).sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      const keysToRemove = sortedEntries.slice(0, ReminderCache.CLEANUP_BATCH_SIZE).map(entry => entry[0]);
    
      if (keysToRemove.length === 0) return;
    
      keysToRemove.forEach(key => delete data[key]);
      await chrome.storage.local.set({ [ReminderCache.STORAGE_KEY]: data });
    
      await ReminderCache.enforceSizeLimit(attempt + 1);
    }
}


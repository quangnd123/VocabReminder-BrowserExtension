import { RemindersSentenceData, ReminderSentenceData } from "../shared/types";

export class ReminderCache {
    private static STORAGE_KEY = "reminder_cache";
    private static MAX_STORAGE_SIZE = 4.5 * 1024 * 1024; // Set limit to 4.5MB (safe margin from 5MB)
    private static CLEANUP_BATCH_SIZE = 50; // Number of least used items to remove in cleanup
  
    static initialize(): void {
      ReminderCache.clear();
      setInterval(() => ReminderCache.clear(), 24 * 60 * 60 * 1000); // Every 24 hours
    }

    static async getBatch(sentences: string[]) : Promise<(RemindersSentenceData|null)[]>{
      const cache = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
      const data: {[sentence: string]: { remindersData: ReminderSentenceData[]; lastAccessed: number }} = cache[ReminderCache.STORAGE_KEY] || {};

      let dataChanged = false;
      let result: (RemindersSentenceData|null)[] = []
      for (const sentence of sentences){
        if (data[sentence]) {
          data[sentence].lastAccessed = Date.now(); // Update usage timestamp
          dataChanged = true;
          result.push({sentence: sentence, remindersData: data[sentence].remindersData});
        }
        else {
          result.push(null)
        }
      }
      
      if (dataChanged) await chrome.storage.local.set({ [ReminderCache.STORAGE_KEY]: data });
      return result;
    }

    static async setBatch(remindersSentenceDataBatch: RemindersSentenceData[]): Promise<void>{
      const cache = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
      let data = cache[ReminderCache.STORAGE_KEY] || {};

      for (const remindersSentenceData of remindersSentenceDataBatch){
        data[remindersSentenceData.sentence] = { remindersData: remindersSentenceData.remindersData, lastAccessed: Date.now() }; // Store with timestamp
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
  
    // Enforce size limit by removing least recently used reminders
    private static async enforceSizeLimit(): Promise<void> {
      const cache = await chrome.storage.local.getBytesInUse(ReminderCache.STORAGE_KEY);
      
      if (cache > ReminderCache.MAX_STORAGE_SIZE) {
        const storedData = await chrome.storage.local.get(ReminderCache.STORAGE_KEY);
        let data: { [sentence: string]: { remindersData: ReminderSentenceData[]; lastAccessed: number } } = storedData[ReminderCache.STORAGE_KEY] || {};
  
        // Sort entries by last accessed timestamp (oldest first)
        const sortedEntries = Object.entries(data).sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        
        // Remove a batch of least recently used entries
        const keysToRemove = sortedEntries.slice(0, ReminderCache.CLEANUP_BATCH_SIZE).map(entry => entry[0]);
        keysToRemove.forEach(key => delete data[key]);
  
        // Save updated storage
        await chrome.storage.local.set({ [ReminderCache.STORAGE_KEY]: data });
  
        // Recursively check if still exceeds size limit
        await ReminderCache.enforceSizeLimit();
      }
    }
}


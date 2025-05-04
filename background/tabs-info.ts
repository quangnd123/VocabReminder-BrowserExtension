export class TabInfoCache {
    private static STORAGE_KEY = "tab_info_cache";

    static async save(tabId: number, info: [Date, string]): Promise<void> {
      const cache = await chrome.storage.local.get(TabInfoCache.STORAGE_KEY);
      const data: Record<number, [string, string][]> = cache[TabInfoCache.STORAGE_KEY] || {};
  
      const pair: [string, string] = [info[0].toString(), info[1]]; // still need to stringify Date
      if (!data[tabId]) {
        data[tabId] = [pair];
      } else {
        data[tabId].push(pair);
      }
  
      await chrome.storage.local.set({ [TabInfoCache.STORAGE_KEY]: data });
    }
  
    static async get(tabId: number): Promise<[Date, string][]> {
      const cache = await chrome.storage.local.get(TabInfoCache.STORAGE_KEY);
      const data: Record<number, [string, string][]> = cache[TabInfoCache.STORAGE_KEY] || {};
  
      return (data[tabId] || []).map(([dateStr, str]) => [new Date(dateStr), str]);
    }
  
    static async delete(tabId: number): Promise<void> {
      const cache = await chrome.storage.local.get(TabInfoCache.STORAGE_KEY);
      const data: Record<number, [string, string][]> = cache[TabInfoCache.STORAGE_KEY] || {};
  
      delete data[tabId];
      await chrome.storage.local.set({ [TabInfoCache.STORAGE_KEY]: data });
    }
  }
  
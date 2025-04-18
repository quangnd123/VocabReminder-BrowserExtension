import {franc} from 'franc'
import { split } from 'sentence-splitter';

function preprocessText(text: string): string {
    return text.trim();
}

function isValidSentence(sentence: string, allowedLanguages: string[]) {
  // Trim whitespace and normalize spaces
  sentence = sentence.trim().replace(/\s+/g, ' ');

  // Ignore only symbols or emojis
  if (/^[\p{P}\p{S}\p{Emoji}]+$/u.test(sentence)) return false;

  // Ignore excessive emoji or symbol usage (more than 80% of text)
  if ((sentence.match(/[\p{Emoji}]/gu) || []).length > sentence.length * 0.8) return false;

  // Ignore mostly numbers (e.g., "1234567" or "999 888 777")
  if (/^\d+(\s\d+)*$/.test(sentence)) return false;

  // Ignore URLs or email addresses
  if (/https?:\/\/\S+|www\.\S+|[\w\.-]+@[\w\.-]+\.\w+/.test(sentence)) return false;

  // Ignore random keyboard mashing (e.g., "asdjklasjd", "qwertyuiop")
  if (/^(?:asdf|qwerty|zxcvbn|poiuy|mnbvc|lkjhg|gfdsa){1,}$/i.test(sentence)) return false;

  const detectedLang = franc(sentence, { minLength: 2, only: allowedLanguages });
  if (!allowedLanguages.includes(detectedLang)) return false;

  return true; // Passed all filters, it's meaningful!
}


  
// Convert When Sending Data to the server
function toSnakeCase(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(toSnakeCase);
    } else if (obj !== null && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key.replace(/([A-Z])/g, "_$1").toLowerCase(), // Convert camelCase to snake_case
                toSnakeCase(value)
            ])
        );
    }
    return obj;
}

// Convert When Receiving Data from the server
function toCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(toCamelCase);
    } else if (obj !== null && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), // Convert snake_case to camelCase
                toCamelCase(value)
            ])
        );
    }
    return obj;
}

function getSelectedPhraseAndText() {
  function getTextInRange(parent: Node, startNode: Node, endNode: Node): string {
    let text = "";
    let isWithinRange = false;

    function traverse(node: Node) {
      if (node === startNode) {
        isWithinRange = true;
      }
      if (isWithinRange && node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
      node.childNodes.forEach(traverse);
      if (node === endNode) {
        isWithinRange = false;
      }
    }

    traverse(parent);
    return text;
  }

  // Extract selected phrase and full text of its container
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.toString().trim() === "") {
    throw new Error("No text selected.");
  }

  const range = selection.getRangeAt(0);
  const text = getTextInRange(range.commonAncestorContainer, range.startContainer, range.endContainer);

  if (!text) {
    throw new Error("Failed to retrieve selected text.");
  }

  return {text, phrase: selection.toString(), startIdx: range.startOffset};
}

function normalizeTextSpaceAndUpdateIndex({ text, phrase, startIdx }: {text: string, phrase: string, startIdx: number}) {
  // Step 1: Normalize spaces in sentence and phrase
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  const cleanedPhrase = phrase.replace(/\s+/g, ' ').trim();

  // Step 2: Create a mapping from old indices to new indices
  let oldToNewIndexMap: Record<number, number> = {};
  let newIndex = 0;
  let oldIndex = 0;
  for (; oldIndex < text.length; oldIndex++) {
      if (!text[oldIndex].match(/\s/)) { 
          oldToNewIndexMap[oldIndex] = newIndex;
          newIndex++;
          if (newIndex<cleanedText.length && cleanedText[newIndex].match(/\s/)) newIndex++;
      }else{
        oldToNewIndexMap[oldIndex] = newIndex;
      }
  }
  oldToNewIndexMap[oldIndex] = newIndex;
  // Step 3: Find the new start index of the phrase occurrence
  let newStartIdx = oldToNewIndexMap[startIdx];
  let newEndIdx = newStartIdx + cleanedPhrase.length;
  // Step 4: Verify that the phrase exists at the new index
  if (newStartIdx) {
      const extractedPhrase = cleanedText.substring(newStartIdx, newEndIdx);
      if (extractedPhrase !== cleanedPhrase) {
          throw new Error("The phrase may have shifted or changed!");
      }
  }
  else{
      throw new Error("Something wrong in normalizing text's spaces!")
  }

  return {
      cleanedText,
      cleanedPhrase,
      newStartIdx,
      newEndIdx
  };
}

function getPhraseContainingSentence({
  text,
  startIdx,
  endIdx,
}: {
  text: string;
  startIdx: number;
  endIdx: number;
}) {
  const sentences = split(text).filter((el) => el.type === "Sentence").map((s) => s.raw);

  let textIdx = 0;
  for (const sentence of sentences) {
    const sentenceEndIdx = textIdx + sentence.length;
    if (textIdx <= startIdx && startIdx < sentenceEndIdx) {
      if (endIdx <= sentenceEndIdx){
        return {
          phraseIdx: startIdx - textIdx,
          sentence: sentence,
        };
      } 
      throw new Error("The selected phrase must be within a single sentence.")
    }
    textIdx = sentenceEndIdx;
    if(textIdx < text.length && text[textIdx]==" ") textIdx++;
  }

  throw new Error("Could not find the selected phrase in the given text.");
}


function getSelectedPhraseAndSentence() {
  const {text, phrase, startIdx} = getSelectedPhraseAndText();
  const {cleanedText, cleanedPhrase, newStartIdx, newEndIdx} = normalizeTextSpaceAndUpdateIndex({text, phrase, startIdx});
  const {sentence, phraseIdx} = getPhraseContainingSentence({text:cleanedText, startIdx: newStartIdx, endIdx: newEndIdx})
  return {phrase: cleanedPhrase, phraseIdx, sentence}
}



export {isValidSentence, preprocessText, toCamelCase, toSnakeCase, getSelectedPhraseAndSentence};


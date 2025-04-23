import {RemindersTextResponseData} from "../shared/types";

export function addReminderPopoverToTextNode(
  textNode: Text,
  remindersSentenceData: RemindersTextResponseData,
  shadowContainer: HTMLDivElement,
  textNode2highlightPopover: Map<Text, HTMLDivElement[]>
){
    const text = textNode.textContent;
    if (!text || text.indexOf(remindersSentenceData.sentence) === -1) {
      console.log("Error: Cannot find sentence " + remindersSentenceData.sentence + " in " + text);
      return;
    }

    const { sentence, reminders_data } = remindersSentenceData;
    reminders_data.forEach(({ word, word_idx, reminder, related_phrase, related_phrase_sentence }) => {
      const text = textNode.nodeValue || "";
      if (word_idx < 0 || word_idx + word.length > sentence.length || sentence.slice(word_idx, word_idx + word.length) !== word){
        console.log("Error: Cannot find word " + word + " in " + sentence);
        return;
      }

      const sentenceIdx = text.indexOf(sentence);
      // Create range to get word position
      const range = document.createRange();
      range.setStart(textNode, sentenceIdx + word_idx);
      range.setEnd(textNode, sentenceIdx + word_idx + word.length);
      const rect = range.getBoundingClientRect();

      // Create container
      const container = document.createElement("div");
      shadowContainer.appendChild(container);
      if (textNode2highlightPopover.get(textNode)){
        textNode2highlightPopover.get(textNode)!.push(container)
      }
      else{
        textNode2highlightPopover.set(textNode, [container])
      }

      // Create highlight
      const highlight = document.createElement("div");
      highlight.classList.add("vocab-reminder-highlight");
      highlight.style.left = `${rect.x + window.scrollX}px`;
      highlight.style.top = `${rect.y + window.scrollY}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
      container.appendChild(highlight);

      // Create popover
      const popover = document.createElement("div");
      popover.classList.add("vocab-reminder-popover");
      popover.innerHTML = `
        <div style="
          font-family: Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #1f2937;
          max-width: 300px;
        ">
          <div>
            <strong>Vocab: </strong>
            ${related_phrase}
          </div>
          <div>
            <strong>Vocab Sentence: </strong>
            <q>${related_phrase_sentence}</q>
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Reminder: </strong>
            ${reminder}
          </div>
        </div>
      `;
      container.appendChild(popover);
      const popoverHeight = popover.offsetHeight;
      popover.style.top = `${rect.y - popoverHeight - 5 + window.scrollX}px`; // Move popover above
      popover.style.left = `${rect.x + rect.width / 2 + window.scrollY}px`; // Center align
      popover.style.transform = "translateX(-50%)"; // Smooth centering
      
  
      function isInViewport() {
        const updatedRect = range.getBoundingClientRect();
        return (
          updatedRect.top >= 0 &&
          updatedRect.left >= 0 &&
          updatedRect.bottom <= window.innerHeight &&
          updatedRect.right <= window.innerWidth
        );
      }

      function updateHighlightPosition() {
        const updatedRect = range.getBoundingClientRect();
        if (isInViewport()) {
          highlight.style.left = `${updatedRect.x + window.scrollX}px`;
          highlight.style.top = `${updatedRect.y + window.scrollY}px`;
          highlight.style.width = `${updatedRect.width}px`;
          highlight.style.height = `${updatedRect.height}px`;
          highlight.style.visibility = "visible";
        }
        else {
          highlight.style.visibility = "hidden";
        }
      }
  
      function updatePopoverPosition() {
        const updatedRect = range.getBoundingClientRect();
        if (isInViewport()) {
          popover.style.top = `${updatedRect.y - popoverHeight - 5 + window.scrollY}px`; // Move popover above
          popover.style.left = `${updatedRect.x + updatedRect.width / 2 + window.scrollX}px`; // Center align
          popover.style.transform = "translateX(-50%)"; // Smooth centering
        }
      }
  
      let hideTimeout;
      function hidePopover() {
        hideTimeout = setTimeout(() => {
            //popover.style.visibility = "hidden";
            popover.classList.remove("show");
        }, 100); // Small delay to avoid flickering
      }

      highlight.addEventListener("mouseenter", () => {
          clearTimeout(hideTimeout); // Prevent hiding
          //popover.style.visibility = "visible"; // Show popover
          popover.classList.add("show");
      });

      popover.addEventListener("mouseenter", () => {
          clearTimeout(hideTimeout); // Prevent hiding
      });

      highlight.addEventListener("mouseleave", hidePopover);
      popover.addEventListener("mouseleave", hidePopover);
  
      window.addEventListener("scroll", updatePopoverPosition);
      window.addEventListener("resize", updatePopoverPosition);

      window.addEventListener("scroll", updateHighlightPosition);
      window.addEventListener("resize", updateHighlightPosition);
    });
}
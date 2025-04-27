export function addPopover(
  textContent: string,
  range: Range,
  shadowContainer: HTMLDivElement
): string {
  const container = document.createElement("div");
  shadowContainer.appendChild(container);

  const popover = document.createElement("div");
  container.appendChild(popover);

  popover.classList.add("vocab-reminder-popover", "show");
  const uniqueId = `vocab-popover-${crypto.randomUUID()}`;
  popover.id = uniqueId;
  (popover as any).__range = range;

  popover.innerHTML = `
    <div style="
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
      max-width: 300px;
    ">
      <button class="close-btn" style="
        position: absolute;
        top: 0.5px;
        right: 0.5px;
        background: transparent;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: #666;
      ">&times;</button>
      <div class="popover-content">${textContent}</div>
    </div>
  `;
  updatePopoverPosition()

  // Close button
  const closeBtn = popover.querySelector(".close-btn") as HTMLButtonElement;
  closeBtn.addEventListener("click", () => {
    popover.classList.remove("show");
    //container.remove();
  });

  function updatePopoverPosition() {
    const padding = 8;
    const updatedRect = range.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    const popoverTop = updatedRect.y - popover.offsetHeight - padding;
    const popoverBottom = updatedRect.y + updatedRect.height + padding;

    if (popoverTop >= 0) {
      popover.style.top = `${popoverTop + scrollY}px`;
    } else {
      popover.style.top = `${popoverBottom + scrollY}px`;
    }

    popover.style.left = `${updatedRect.x + updatedRect.width / 2 + scrollX}px`;
    popover.style.transform = "translateX(-50%)";
    popover.style.position = "absolute";
  }


  window.addEventListener("scroll", updatePopoverPosition);
  window.addEventListener("resize", updatePopoverPosition);
  
  return uniqueId;
}


export function updatePopoverContent(
  popover: HTMLDivElement,
  textContent: string
) {
  const lines = textContent.split("\n");
  let formattedHTML = ``;

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const title = line.slice(0, colonIndex + 1);
      const content = line.slice(colonIndex + 1).trim();
      formattedHTML += `<p><strong>${title}</strong> ${content}</p>\n`;
    } else {
      formattedHTML += `<p>${line}</p>`;
    }
  }

  const contentDiv = popover.querySelector(".popover-content");
  if (contentDiv) {
    contentDiv.innerHTML = formattedHTML;
    const range = (popover as any).__range as Range;
    updatePopoverPosition() 

    function updatePopoverPosition() {
      const padding = 8;
      const updatedRect = range.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      const popoverTop = updatedRect.y - popover.offsetHeight - padding;
      const popoverBottom = updatedRect.y + updatedRect.height + padding;

      if (popoverTop >= 0) {
        popover.style.top = `${popoverTop + scrollY}px`;
      } else {
        popover.style.top = `${popoverBottom + scrollY}px`;
      }

      popover.style.left = `${updatedRect.x + updatedRect.width / 2 + scrollX}px`;
      popover.style.transform = "translateX(-50%)";
      popover.style.position = "absolute";
    }
  }
}
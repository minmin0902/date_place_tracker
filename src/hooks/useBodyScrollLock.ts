import { useEffect } from "react";

// Lock body scroll while a modal/sheet is open. iOS Safari's plain
// `body { overflow: hidden }` trick isn't enough — the page underneath
// still scrolls when the user touches the modal's edges (scroll
// chaining). The robust pattern saves the current scrollY, then pins
// the body via position:fixed + top:-scrollY, freezing the page in
// place. On close it restores the position and scrolls back.
//
// Two modals open simultaneously (e.g. ConfirmDialog over an already-
// open sheet) is handled by reference-counting so the unlock only
// fires when the LAST modal closes.
let lockCount = 0;
let savedScrollY = 0;

function lock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    // Belt + suspenders: also set overflow hidden in case the
    // position:fixed trick falls through on some Android version.
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    // Restore scroll position so the user lands where they left off.
    window.scrollTo(0, savedScrollY);
  }
}

export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return () => unlock();
  }, [active]);
}

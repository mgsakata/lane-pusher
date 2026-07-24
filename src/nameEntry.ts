const NAME_KEY = 'lane-pusher.name';

/**
 * Shows a small DOM overlay to collect a name for a high score. Resolves with
 * the trimmed name, or null if skipped. Uses an HTML input because typing on a
 * canvas is miserable.
 */
export function promptName(rank: number): Promise<string | null> {
  return new Promise((resolve) => {
    const last = readLastName();

    const overlay = document.createElement('div');
    overlay.className = 'name-overlay';
    overlay.innerHTML = `
      <div class="name-card">
        <div class="name-title">HIGH SCORE!</div>
        <div class="name-sub">You ranked #${rank} — enter your name</div>
        <input class="name-input" maxlength="12" placeholder="ANON" spellcheck="false" autocomplete="off" />
        <div class="name-actions">
          <button class="name-skip" type="button">Skip</button>
          <button class="name-save" type="button">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector<HTMLInputElement>('.name-input')!;
    input.value = last;
    // Focus after the element is in the DOM so mobile keyboards open.
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (value) writeLastName(value);
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector('.name-save')!.addEventListener('click', () => {
      finish(input.value.trim() || 'ANON');
    });
    overlay.querySelector('.name-skip')!.addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (e) => {
      // Keep game shortcuts from firing while typing.
      e.stopPropagation();
      if (e.key === 'Enter') finish(input.value.trim() || 'ANON');
      if (e.key === 'Escape') finish(null);
    });
  });
}

function readLastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeLastName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage unavailable; no-op
  }
}

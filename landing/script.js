document.addEventListener("DOMContentLoaded", () => {
  // MARK: - Screenshot Tabs
  const previewImg = document.getElementById("preview-img");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const contextTitle = document.getElementById("context-title");
  const contextDesc = document.getElementById("context-desc");
  const contextTags = document.getElementById("context-tags");

  const tabData = {
    failed: {
      img: "./assets/failed.png",
      alt: "Mewra PreFlight: Failed Check with In-Editor QuickFix",
      title:
        "Blockers Caught Early with Clickable Findings & One-Click QuickFix",
      desc: "PreFlight detects that app.tsx is unformatted. A single click on 'Fix' repairs the file. Missing tools (ESLint) degrade gracefully to 'not-configured' with an Install button instead of crashing.",
      tags: [
        { label: "1 Blocker (Red)", class: "rose" },
        { label: "Prettier Fix All", class: "neutral" },
        { label: "ESLint (Not Configured)", class: "neutral" },
        { label: "PR Launch Locked", class: "rose" },
      ],
    },
    warning: {
      img: "./assets/warning.png",
      alt: "Mewra PreFlight: Non-Blocking Warnings & Review",
      title: "Non-Blocking Warnings & Dynamic Branch Switching",
      desc: "PreFlight checks against develop or main. Non-critical findings (e.g. missing test pairing) are highlighted for review without blocking your urgent PR workflow.",
      tags: [
        { label: "1 Warning (Amber)", class: "amber" },
        { label: "Test Pairing Check", class: "neutral" },
        { label: "Branch vs Target Diff", class: "neutral" },
        { label: "PR Launch Ready", class: "emerald" },
      ],
    },
    pass: {
      img: "./assets/pass.png",
      alt: "Mewra PreFlight: Green Pipeline Ready to Create a PR or MR",
      title: "All Diff Checks Passed — Ready to Create a PR / MR",
      desc: "All universal guardrails and ecosystem packs passed cleanly in milliseconds. PreFlight unlocks the emerald 'Create PR / MR' button. Your normal Git workflow remains responsible for pushing the branch.",
      tags: [
        { label: "All Passed (Green)", class: "emerald" },
        { label: "Status Bar: Ready", class: "emerald" },
        { label: "Create GitHub PR / GitLab MR", class: "emerald" },
        { label: "Diff-Scoped (1ms - 248ms)", class: "neutral" },
      ],
    },
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-tab");
      const data = tabData[mode];
      if (!data) return;

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (previewImg) {
        previewImg.style.opacity = "0.4";
        setTimeout(() => {
          previewImg.src = data.img;
          previewImg.alt = data.alt;
          previewImg.style.opacity = "1";
        }, 120);
      }

      if (contextTitle) contextTitle.textContent = data.title;
      if (contextDesc) contextDesc.textContent = data.desc;
      if (contextTags) {
        contextTags.innerHTML = data.tags
          .map((t) => `<span class="tag ${t.class}">${t.label}</span>`)
          .join("");
      }
    });
  });

  // MARK: - Terminal Tabs Switcher
  const termTabs = document.querySelectorAll(".term-tab");
  const termCmd = document.getElementById("terminal-cmd");
  const promptSymbol = document.getElementById("prompt-symbol");
  let currentCmd = "ext install mewra.mewra-preflight";

  termTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      termTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const cmd = tab.getAttribute("data-cmd");
      const prompt = tab.getAttribute("data-prompt") || ">";
      if (termCmd && cmd) {
        termCmd.textContent = cmd;
        currentCmd = cmd;
      }
      if (promptSymbol) {
        promptSymbol.textContent = prompt;
      }
    });
  });

  // MARK: - Copy Command Button
  const copyBtn = document.getElementById("copy-btn");
  const copyText = document.getElementById("copy-text");

  if (copyBtn && copyText) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(currentCmd);
        const original = copyText.textContent;
        copyText.textContent = "Copied!";
        copyBtn.style.color = "#10b981";
        copyBtn.style.borderColor = "#10b981";
        setTimeout(() => {
          copyText.textContent = original;
          copyBtn.style.color = "";
          copyBtn.style.borderColor = "";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy", err);
      }
    });
  }

  // MARK: - Copy CLI Button
  const copyCliBtn = document.getElementById("copy-cli-btn");
  const copyCliText = document.getElementById("copy-cli-text");

  if (copyCliBtn && copyCliText) {
    copyCliBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          "code --install-extension mewra.mewra-preflight",
        );
        const original = copyCliText.textContent;
        copyCliText.textContent = "Copied!";
        copyCliBtn.style.color = "#10b981";
        copyCliBtn.style.borderColor = "#10b981";
        setTimeout(() => {
          copyCliText.textContent = original;
          copyCliBtn.style.color = "";
          copyCliBtn.style.borderColor = "";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy", err);
      }
    });
  }
});

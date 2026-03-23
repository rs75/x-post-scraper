document.addEventListener('DOMContentLoaded', function() {
  const crawlButton = document.getElementById('crawlButton');
  const seeResultsButton = document.getElementById('seeResultsButton');
  const postCounter = document.getElementById('postCounter');
  const autoScrollCheckbox = document.getElementById('autoScrollCheckbox');
  const ignoreRepostsCheckbox = document.getElementById('ignoreRepostsCheckbox');

  function updateButton(isScraping) {
    if (isScraping) {
        crawlButton.textContent = 'Stop Scraping';
        crawlButton.classList.add('scraping');
    } else {
        crawlButton.textContent = 'Scrape Posts';
        crawlButton.classList.remove('scraping');
    }
  }

  // Check initial scraping state when popup opens
  chrome.runtime.sendMessage({ action: "get_scrape_status" }, (response) => {
    if (chrome.runtime.lastError) {
        // Handle error, e.g., if background script is not ready
        console.error(chrome.runtime.lastError.message);
    } else {
        if (response) {
            updateButton(response.isScraping);
        }
    }
  });

  // Load initial counts from storage
  chrome.storage.local.get(['posts'], function(result) {
    postCounter.textContent = result.posts ? result.posts.length : 0;
  });

  // Auto-scroll checkbox listener
  autoScrollCheckbox.addEventListener('change', () => {
    if (autoScrollCheckbox.checked) {
        console.log('Popup: Auto-scroll enabled');
        chrome.runtime.sendMessage({ action: "start_auto_scroll" });
    } else {
        console.log('Popup: Auto-scroll disabled');
        chrome.runtime.sendMessage({ action: "stop_auto_scroll" });
    }
  });

  crawlButton.addEventListener('click', () => {
    if (crawlButton.textContent === 'Scrape Posts') {
        const ignoreReposts = ignoreRepostsCheckbox.checked;
        chrome.runtime.sendMessage({ action: "start_scrape", ignoreReposts: ignoreReposts });
        updateButton(true);
    } else {
        chrome.runtime.sendMessage({ action: "stop_scrape" });
        updateButton(false);
    }
  });

  seeResultsButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "see_results" });
  });

  // Listen for updates from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "update_counts") {
      postCounter.textContent = request.postCount;
    } else if (request.action === "update_button") {
        updateButton(request.isScraping);
    }
  });
});

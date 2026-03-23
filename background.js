let scrapingState = {}; // Tracks scraping status per tab: { tabId: boolean }

// Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    delete scrapingState[tabId];
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (scrapingState[details.tabId]) {
        chrome.tabs.sendMessage(details.tabId, { action: "execute_scrape" });
    }
}, { url: [{ hostContains: 'x.com' }, { hostContains: 'twitter.com' }] });

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ posts: [], seen_ids: {} });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : request.tabId;

  if (request.action === "start_scrape") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            const activeTabId = tabs[0].id;
            scrapingState[activeTabId] = true;
            chrome.scripting.executeScript({
                target: { tabId: activeTabId },
                files: ['text_utils.js', 'content.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to inject script: ', chrome.runtime.lastError);
                    scrapingState[activeTabId] = false; // Reset state on failure
                    chrome.runtime.sendMessage({ action: "update_button", isScraping: false });
                    sendResponse({ status: "failed" });
                    return;
                }
                chrome.tabs.sendMessage(activeTabId, { 
                    action: "execute_scrape",
                    ignoreReposts: request.ignoreReposts || false
                });
                chrome.runtime.sendMessage({ action: "update_button", isScraping: true });
                sendResponse({ status: "started" });
            });
        }
    });
    return true;
  } else if (request.action === "start_auto_scroll") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            const activeTabId = tabs[0].id;
            // Inject content script if not already injected
            chrome.scripting.executeScript({
                target: { tabId: activeTabId },
                files: ['text_utils.js', 'content.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to inject script for auto-scroll:', chrome.runtime.lastError);
                    sendResponse({ status: "failed" });
                    return;
                }
                // Send the start auto-scroll message
                chrome.tabs.sendMessage(activeTabId, { action: "start_auto_scroll" });
                console.log('Background: Sent start_auto_scroll message');
                sendResponse({ status: "auto-scroll started" });
            });
        } else {
            sendResponse({ status: "no active tab" });
        }
    });
    return true;
  } else if (request.action === "stop_auto_scroll") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "stop_auto_scroll" });
            console.log('Background: Sent stop_auto_scroll message');
            sendResponse({ status: "auto-scroll stopped" });
        } else {
            sendResponse({ status: "no active tab" });
        }
    });
    return true;
  } else if (request.action === "stop_scrape") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            const activeTabId = tabs[0].id;
            scrapingState[activeTabId] = false;
            chrome.tabs.sendMessage(activeTabId, { action: "stop_execution" });
            chrome.runtime.sendMessage({ action: "update_button", isScraping: false });
            sendResponse({ status: "stopped" });
        }
    });
    return true;
  } else if (request.action === "get_scrape_status") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
              sendResponse({ isScraping: !!scrapingState[tabs[0].id] });
          } else {
              sendResponse({ isScraping: false });
          }
      });
      return true;
  } else if (request.action === "update_counts") {
    const newPosts = request.posts;
    if (!newPosts || newPosts.length === 0) {
        // If there are no new posts (e.g., from a single tweet page), do nothing.
        sendResponse({ status: "no posts" });
        return;
    }

    // Get existing posts, append new ones, and save
    chrome.storage.local.get(['posts', 'seen_ids'], (data) => {
        const existingPosts = data.posts || [];
        const seenIds = data.seen_ids || {};
        
        const currentProfileHandle = newPosts[0].profile_x_handle;
        if (!seenIds[currentProfileHandle]) {
            seenIds[currentProfileHandle] = {};
        }

        const trulyNewPosts = newPosts.filter(post => !seenIds[currentProfileHandle][post.post_id]);
        
        if (trulyNewPosts.length > 0) {
            trulyNewPosts.forEach(post => {
                seenIds[currentProfileHandle][post.post_id] = true;
            });

            const combinedPosts = [...existingPosts, ...trulyNewPosts];

            chrome.storage.local.set({ posts: combinedPosts, seen_ids: seenIds }, () => {
                chrome.runtime.sendMessage({
                    action: "update_counts",
                    postCount: combinedPosts.length
                });
                sendResponse({ status: "updated" });
            });
        } else {
            sendResponse({ status: "no new posts" });
        }
    });
    return true; // Important for async response
  } else if (request.action === "see_results") {
    chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
  }
});

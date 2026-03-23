// Prevent multiple injections
if (window.xScraperInjected) {
    console.log('X Scraper: Already injected, skipping.');
} else {
    window.xScraperInjected = true;

let observer = null;
const processedPosts = new Set();
let autoScrollInterval = null;
let ignoreReposts = false;

function extractTextPreservingEmojis(element) {
    const fn = globalThis.XScraperTextUtils?.extractTextPreservingEmojis;
    if (typeof fn === 'function') return fn(element);
    return element?.textContent?.trim?.() ?? '';
}

function getPostId(article) {
    const timeElement = article.querySelector('time');
    const postLink = timeElement ? timeElement.closest('a') : null;
    const postHref = postLink ? postLink.href : '';
    return postHref.split('/').pop() || null;
}

function scrapePostData(article) {
    let profileName = 'N/A';
    let profileHandle = 'N/A';
    
    const timeElement = article.querySelector('time');
    const postId = getPostId(article);
    
    // Extract handle from the post URL (most reliable method)
    const postLink = timeElement ? timeElement.closest('a') : null;
    
    if (postLink && postLink.href) {
        // URL format: https://x.com/username/status/123456
        const match = postLink.href.match(/(?:x\.com|twitter\.com)\/([^\/]+)/);
        if (match && match[1] && match[1] !== 'i' && match[1] !== 'status') {
            profileHandle = '@' + match[1];
        }
    }
    
    // Extract profile name from the post header - try multiple selectors
    let userNameElement = article.querySelector('div[data-testid="User-Name"] a[role="link"] span span');
    if (!userNameElement) {
        // Fallback: try another common selector
        userNameElement = article.querySelector('div[data-testid="User-Name"] div[dir="ltr"] span span');
    }
    if (!userNameElement) {
        // Fallback: get first span in User-Name area that's not the handle
        const userNameContainer = article.querySelector('div[data-testid="User-Name"]');
        if (userNameContainer) {
            const spans = userNameContainer.querySelectorAll('span');
            for (const span of spans) {
                const text = extractTextPreservingEmojis(span);
                if (text && !text.startsWith('@') && !text.includes('·')) {
                    profileName = text;
                    break;
                }
            }
        }
    } else {
        profileName = extractTextPreservingEmojis(userNameElement);
    }

    const statsGroup = article.querySelector('div[role="group"]');
    const statsLabel = statsGroup ? statsGroup.getAttribute('aria-label') : '';

    const getStatValue = (label, statName) => {
        if (!label) return '0';
        const regex = new RegExp('([\\d,.]+K?M?B?)\\s+' + statName, 'i');
        const match = label.match(regex);
        return match && match[1] ? match[1] : '0';
    };

    const comments = getStatValue(statsLabel, 'repl(y|ies)');
    const reposts = getStatValue(statsLabel, 'repost(s)?');
    const likes = getStatValue(statsLabel, 'like(s)?');
    
    const linkElement = article.querySelector('a[target="_blank"][rel="noopener noreferrer nofollow"]');
    
    // Extract images - try multiple selectors to catch all image types
    let imageUrls = [];
    
    // Method 1: Try the photos testid selector
    let imageElements = article.querySelectorAll('div[data-testid="photos"] img');
    if (imageElements.length === 0) {
        // Method 2: Try tweetPhoto testid selector
        imageElements = article.querySelectorAll('div[data-testid="tweetPhoto"] img');
    }
    if (imageElements.length === 0) {
        // Method 3: Find all img tags with pbs.twimg.com source (Twitter's CDN)
        const allImages = article.querySelectorAll('img[src*="pbs.twimg.com"]');
        imageElements = Array.from(allImages).filter(img => {
            // Filter out profile avatars and other small images
            return !img.src.includes('profile_images') && img.alt !== '';
        });
    }
    
    imageUrls = Array.from(imageElements).map(img => img.src).filter(src => src && src.length > 0);

    // Check if post is a repost by looking for "reposted" text
    const socialContext = article.querySelector('[data-testid="socialContext"]');
    const isRepost = socialContext ? socialContext.textContent.toLowerCase().includes('reposted') : false;

    // If it's a repost, extract the reposter's handle and name
    let reposterHandle = profileHandle;
    let reposterName = profileName;
    
    if (isRepost && socialContext) {
        // Extract reposter's name from socialContext (e.g., "Security Trybe reposted")
        const reposterLink = socialContext.querySelector('a[href]');
        if (reposterLink && reposterLink.href) {
            // Extract handle from the reposter's profile link
            const match = reposterLink.href.match(/(?:x\.com|twitter\.com)\/([^\/]+)/);
            if (match && match[1]) {
                reposterHandle = '@' + match[1];
                // Get the reposter's name from the link text
                const nameSpan = reposterLink.querySelector('span');
                if (nameSpan) {
                    reposterName = nameSpan.textContent.trim();
                }
            }
        }
    }

    return {
        post_id: postId,
        tweet_text: extractTextPreservingEmojis(article.querySelector('[data-testid="tweetText"]')) || 'N/A',
        posted_timestamp: timeElement?.getAttribute('datetime') ?? 'N/A',
        reposts: reposts,
        likes: likes,
        comments: comments,
        image_urls: imageUrls,
        external_link: linkElement ? linkElement.href : 'N/A',
        is_repost: isRepost,
        profilename: isRepost ? reposterName : profileName,
        profile_x_handle: isRepost ? reposterHandle : profileHandle,
        original_poster_name: isRepost ? profileName : 'N/A',
        original_poster_handle: isRepost ? profileHandle : 'N/A',
    };
}

function processArticle(article) {
    const postId = getPostId(article);
    if (!postId || processedPosts.has(postId)) {
        return;
    }

    // Check if this is a repost and if we should ignore it
    if (ignoreReposts) {
        const socialContext = article.querySelector('[data-testid="socialContext"]');
        const isRepost = socialContext ? socialContext.textContent.toLowerCase().includes('reposted') : false;
        if (isRepost) {
            console.log(`X Scraper: Skipping repost ${postId} (ignore reposts enabled)`);
            processedPosts.add(postId);
            return;
        }
    }

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds total wait time

    const intervalId = setInterval(() => {
        attempts++;
        const statsGroup = article.querySelector('div[role="group"]');

        if (statsGroup && statsGroup.getAttribute('aria-label')) {
            clearInterval(intervalId);
            processedPosts.add(postId);
            const postData = scrapePostData(article);
            console.log('X Scraper: Scraped post:', postData);
            chrome.runtime.sendMessage({ action: "update_counts", posts: [postData] });
        } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.log(`X Scraper: Timed out waiting for stats on post ${postId}.`);
        }
    }, 100);
}

function startAutoScroll() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    
    autoScrollInterval = setInterval(() => {
        const scrollAmount = 2000; // Scroll down 2000px (5x faster than before)
        const beforeScroll = window.scrollY;
        
        // Scroll down
        window.scrollBy({ 
            top: scrollAmount, 
            left: 0,
            behavior: 'smooth' 
        });
        
        console.log('X Scraper: Scrolling down from', beforeScroll, 'to', window.scrollY + scrollAmount);
        
        // Check if we've reached the bottom - if so, load more content by staying at bottom
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
            console.log('X Scraper: Reached bottom, continuing to load more content...');
        }
    }, 1500); // Scroll every 1.5 seconds (5x faster scroll amount)
    
    console.log('X Scraper: Auto-scrolling DOWN started at HIGH speed (5x)');
}

function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
        console.log('X Scraper: Auto-scrolling disabled');
    }
}

function startObserver() {
    if (observer) observer.disconnect();

    const observerCallback = (mutationsList, obs) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        const articles = node.querySelectorAll('article[data-testid="tweet"]');
                        articles.forEach(processArticle);
                    }
                });
            }
        }
    };

    observer = new MutationObserver(observerCallback);
    observer.observe(document.body, { childList: true, subtree: true });

    // Process posts that are already on the page
    document.querySelectorAll('article[data-testid="tweet"]').forEach(processArticle);
}

function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    processedPosts.clear();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "execute_scrape") {
        ignoreReposts = request.ignoreReposts || false;
        console.log('X Scraper: Starting observer. Ignore reposts:', ignoreReposts);
        startObserver();
        sendResponse({ status: "scraping started" });
    } else if (request.action === "stop_execution") {
        console.log('X Scraper: Stopping observer.');
        stopObserver();
        sendResponse({ status: "scraping stopped" });
    } else if (request.action === "start_auto_scroll") {
        console.log('X Scraper: Starting auto-scroll.');
        startAutoScroll();
        sendResponse({ status: "auto-scroll started" });
    } else if (request.action === "stop_auto_scroll") {
        console.log('X Scraper: Stopping auto-scroll.');
        stopAutoScroll();
        sendResponse({ status: "auto-scroll stopped" });
    }
});

} // End of injection check

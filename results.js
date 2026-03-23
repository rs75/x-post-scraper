document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const profileHeader = document.getElementById('profileHeader');
    const resultsTextarea = document.getElementById('resultsTextarea');
    const statsContainer = document.getElementById('statsContainer');
    const paginationContainer = document.getElementById('paginationContainer');
    const copyButton = document.getElementById('copyButton');
    const deleteButton = document.getElementById('deleteButton');
    const textButton = document.getElementById('textButton');
    const jsonButton = document.getElementById('jsonButton');
    const showAllButton = document.getElementById('showAllButton');

    let profiles = {}; // To hold data grouped by profile handle
    let currentProfileHandle = null;
    let currentView = 'json'; // 'text' or 'json'
    let profileCache = {}; // To cache stats and formatted posts
    let allPosts = []; // To store all posts for "Show All"

    const POSTS_PER_PAGE = 50;
    let currentPage = 1;

    function renderStatCards(items) {
        return items.map((item) => `
            <div class="stat-card">
                <span class="stat-label">${item.label}</span>
                <span class="stat-value">${item.value}</span>
            </div>
        `).join('');
    }

    // 1. Load data from storage and group by profile
    chrome.storage.local.get('posts', (data) => {
        if (data.posts) {
            allPosts = data.posts; // Store all posts
            profiles = data.posts.reduce((acc, post) => {
                const handle = post.profile_x_handle;
                if (!acc[handle]) {
                    acc[handle] = [];
                }
                acc[handle].push(post);
                return acc;
            }, {});
            populateSidebar();
            // Show All by default
            if (allPosts.length > 0) {
                showAllButton.classList.add('active');
                displayAllPosts();
            }
        }
    });

    // 2. Populate sidebar with profile buttons
    function populateSidebar() {
        sidebar.innerHTML = '';
        Object.keys(profiles).forEach((handle, index) => {
            const button = document.createElement('button');
            const profileName = profiles[handle][0].profilename;
            // If profile name is N/A, just show the handle
            button.textContent = profileName === 'N/A' ? handle : `${profileName} (${handle})`;
            button.dataset.handle = handle;
            button.addEventListener('click', (e) => {
                // Remove active class from all buttons (including Show All)
                showAllButton.classList.remove('active');
                const currentActive = document.querySelector('.sidebar button.active');
                if (currentActive) {
                    currentActive.classList.remove('active');
                }
                // Add active class to clicked button
                e.currentTarget.classList.add('active');
                displayProfileData(handle);
            });
            sidebar.appendChild(button);
        });
    }

    // 3. Display data for the selected profile
    function displayProfileData(handle, loadMore = false) {
        if (currentProfileHandle !== handle || !loadMore) {
            currentPage = 1;
        }
        currentProfileHandle = handle;

        const posts = profiles[handle];
        if (!posts) return;

        const profileName = posts[0].profilename;
        profileHeader.textContent = profileName === 'N/A' ? `Results for ${handle}` : `Results for ${profileName} (${handle})`;
        
        // Use cache if available
        if (!profileCache[handle]) {
            profileCache[handle] = {};
        }

        const startIndex = 0;
        const endIndex = currentPage * POSTS_PER_PAGE;
        const postsToShow = posts.slice(startIndex, endIndex);

        renderPosts(postsToShow);
        renderStats(handle, posts);
        renderPaginationControls(posts);
        
    }

    function renderPosts(postsToShow) {
        if (currentView === 'json') {
            resultsTextarea.value = JSON.stringify(postsToShow, null, 2);
        } else {
            resultsTextarea.value = postsToShow.map(post => {
                let imageUrlsText = 'Image URLs: N/A';
                if (post.image_urls && post.image_urls.length > 0) {
                    imageUrlsText = `Image URLs:\n${post.image_urls.join('\n')}`;
                }

                let repostInfo = '';
                if (post.is_repost && post.original_poster_handle && post.original_poster_handle !== 'N/A') {
                    repostInfo = `Original Poster: ${post.original_poster_name} (${post.original_poster_handle})\n`;
                }

                return `
${post.tweet_text}

Timestamp: ${post.posted_timestamp}
Likes: ${post.likes}, Comments: ${post.comments}, Reposts: ${post.reposts}
Is Repost: ${post.is_repost}
${repostInfo}External Link: ${post.external_link}
${imageUrlsText}
--------------------------------------------------
                `;
            }).join('');
        }
    }

    function renderStats(handle, posts) {
        if (!profileCache[handle].stats) {
            const totalPosts = posts.length;
            const totalLikes = posts.reduce((sum, post) => sum + parseInt(post.likes, 10), 0);
            const totalComments = posts.reduce((sum, post) => sum + parseInt(post.comments, 10), 0);
            const totalReposts = posts.reduce((sum, post) => sum + parseInt(post.reposts, 10), 0);

            profileCache[handle].stats = renderStatCards([
                { label: 'Total Posts', value: totalPosts },
                { label: 'Total Likes', value: totalLikes },
                { label: 'Total Comments', value: totalComments },
                { label: 'Total Reposts', value: totalReposts }
            ]);
        }
        statsContainer.innerHTML = profileCache[handle].stats;
    }

    function renderPaginationControls(posts) {
        paginationContainer.innerHTML = '';
        const totalPosts = posts.length;
        const postsShown = currentPage * POSTS_PER_PAGE;

        if (postsShown < totalPosts) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Load More';
            loadMoreButton.id = 'loadMoreButton';
            loadMoreButton.addEventListener('click', () => {
                currentPage++;
                displayProfileData(currentProfileHandle, true);
            });
            paginationContainer.appendChild(loadMoreButton);
        }

        const paginationInfo = document.createElement('span');
        paginationInfo.id = 'paginationInfo';
        paginationInfo.textContent = `Showing ${Math.min(postsShown, totalPosts)} of ${totalPosts} posts`;
        paginationContainer.appendChild(paginationInfo);
    }

    // 4. Copy to clipboard
    copyButton.addEventListener('click', () => {
        resultsTextarea.select();
        document.execCommand('copy');
    });

    // 5. Delete all results
    deleteButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete all results? This cannot be undone.')) {
            chrome.storage.local.set({ posts: [], seen_ids: {} }, () => {
                sidebar.innerHTML = '';
                profileHeader.textContent = 'No results';
                resultsTextarea.value = '';
                statsContainer.innerHTML = '';
                paginationContainer.innerHTML = '';
                profiles = {};
                currentProfileHandle = null;
                profileCache = {};
            });
        }
    });

    // 6. Show All button
    showAllButton.addEventListener('click', () => {
        // Remove active class from all sidebar buttons
        const allSidebarButtons = sidebar.querySelectorAll('button');
        allSidebarButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to Show All button
        showAllButton.classList.add('active');
        
        // Display all posts
        displayAllPosts();
    });

    function displayAllPosts() {
        currentProfileHandle = 'ALL';
        currentPage = 1;
        
        profileHeader.textContent = `All Results (${allPosts.length} posts)`;
        
        const postsToShow = allPosts.slice(0, currentPage * POSTS_PER_PAGE);
        renderPosts(postsToShow);
        renderAllStats();
        renderAllPagination();
    }

    function renderAllStats() {
        const totalPosts = allPosts.length;
        const totalLikes = allPosts.reduce((sum, post) => sum + parseInt(post.likes || 0, 10), 0);
        const totalComments = allPosts.reduce((sum, post) => sum + parseInt(post.comments || 0, 10), 0);
        const totalReposts = allPosts.reduce((sum, post) => sum + parseInt(post.reposts || 0, 10), 0);
        const uniqueProfiles = Object.keys(profiles).length;

        statsContainer.innerHTML = renderStatCards([
            { label: 'Total Posts', value: totalPosts },
            { label: 'Profiles', value: uniqueProfiles },
            { label: 'Total Likes', value: totalLikes },
            { label: 'Total Comments', value: totalComments },
            { label: 'Total Reposts', value: totalReposts }
        ]);
    }

    function renderAllPagination() {
        paginationContainer.innerHTML = '';
        const totalPosts = allPosts.length;
        const postsShown = currentPage * POSTS_PER_PAGE;

        if (postsShown < totalPosts) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Load More';
            loadMoreButton.id = 'loadMoreButton';
            loadMoreButton.addEventListener('click', () => {
                currentPage++;
                const postsToShow = allPosts.slice(0, currentPage * POSTS_PER_PAGE);
                renderPosts(postsToShow);
                renderAllPagination();
            });
            paginationContainer.appendChild(loadMoreButton);
        }

        const paginationInfo = document.createElement('span');
        paginationInfo.id = 'paginationInfo';
        paginationInfo.textContent = `Showing ${Math.min(postsShown, totalPosts)} of ${totalPosts} posts`;
        paginationContainer.appendChild(paginationInfo);
    }

    // 7. View toggle logic
    textButton.addEventListener('click', () => {
        if (currentView === 'json') {
            currentView = 'text';
            textButton.classList.add('active');
            jsonButton.classList.remove('active');
            if (currentProfileHandle === 'ALL') {
                const posts = allPosts.slice(0, currentPage * POSTS_PER_PAGE);
                renderPosts(posts);
            } else if (currentProfileHandle) {
                const posts = profiles[currentProfileHandle].slice(0, currentPage * POSTS_PER_PAGE);
                renderPosts(posts);
            }
        }
    });

    jsonButton.addEventListener('click', () => {
        if (currentView === 'text') {
            currentView = 'json';
            jsonButton.classList.add('active');
            textButton.classList.remove('active');
            if (currentProfileHandle === 'ALL') {
                const posts = allPosts.slice(0, currentPage * POSTS_PER_PAGE);
                renderPosts(posts);
            } else if (currentProfileHandle) {
                const posts = profiles[currentProfileHandle].slice(0, currentPage * POSTS_PER_PAGE);
                renderPosts(posts);
            }
        }
    });
});

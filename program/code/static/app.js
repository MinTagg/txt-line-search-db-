document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const resultsContainer = document.getElementById('results');
    const fileViewer = document.getElementById('file-viewer');
    const fileSpinner = document.getElementById('file-spinner');
    const rightPane = document.getElementById('right-pane');

    // Global states
    let lines = [];
    let searchResults = [];
    let renderedResultsCount = 0;
    let highlightedLineNumber = null;
    let highlightTimeout = null;
    let currentSearchQuery = '';

    const RESULTS_BATCH_SIZE = 100;

    // Enable/disable search button based on input content
    searchInput.addEventListener('input', () => {
        searchButton.disabled = searchInput.value.trim().length === 0;
    });

    // Handle search button click
    searchButton.addEventListener('click', runSearch);

    // Handle Enter keypress in search input
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !searchButton.disabled) {
            runSearch();
        }
    });

    // Run search query
    async function runSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        // Disable input and button while loading
        searchInput.disabled = true;
        searchButton.disabled = true;
        resultsContainer.innerHTML = '<div class="spinner" style="margin: 40px auto 0;"></div>';

        try {
            const response = await fetch(`/api/search/${encodeURIComponent(datasetName)}?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            // Re-enable input
            searchInput.disabled = false;
            searchButton.disabled = false;

            if (!data.ok) {
                // Parse or syntax error
                let errMsg = data.error || '검색 중 오류가 발생했습니다.';
                if (data.detail) {
                    errMsg += `\n상세 정보: ${data.detail}`;
                }
                resultsContainer.innerHTML = `
                    <div class="empty-result" style="color: #f87171; border: 1px dashed #ef4444; border-radius: 8px; background: rgba(239, 68, 68, 0.05); padding: 16px; margin-top: 10px; text-align: left;">
                        <strong>검색식 오류:</strong> ${escapeHtml(data.detail || data.error)}
                    </div>
                `;
                return;
            }

            currentSearchQuery = query;
            renderResults(data.results, data.count, query);
        } catch (err) {
            console.error(err);
            searchInput.disabled = false;
            searchButton.disabled = false;
            resultsContainer.innerHTML = '<div class="empty-result" style="color: #ef4444;">서버와의 통신이 실패했습니다.</div>';
        }
    }

    // Render search results with pagination (infinite scroll)
    function renderResults(results, count, query) {
        resultsContainer.innerHTML = '';
        searchResults = results;
        renderedResultsCount = 0;

        if (count === 0) {
            resultsContainer.innerHTML = '<div class="empty-result">검색 결과가 없습니다.</div>';
            return;
        }

        // Add meta info header
        const metaInfo = document.createElement('div');
        metaInfo.className = 'search-meta';
        metaInfo.innerHTML = `총 <strong>${count.toLocaleString()}</strong>개의 줄이 검색되었습니다.`;
        resultsContainer.appendChild(metaInfo);

        // Render first batch of search results
        renderNextResultsBatch();
    }

    function renderNextResultsBatch() {
        if (!searchResults || renderedResultsCount >= searchResults.length) return;

        const nextBatch = searchResults.slice(renderedResultsCount, renderedResultsCount + RESULTS_BATCH_SIZE);
        
        nextBatch.forEach(item => {
            const block = document.createElement('div');
            block.className = 'result-block';
            block.dataset.lineNumber = item.line_number;

            block.innerHTML = `
                <div class="result-header">
                    <span class="result-line-num">줄 ${item.line_number}</span>
                </div>
                <div class="result-preview">${escapeHtml(item.preview)}</div>
            `;

            block.addEventListener('click', () => {
                scrollToLine(item.line_number);
            });

            resultsContainer.appendChild(block);
        });

        renderedResultsCount += nextBatch.length;
    }

    // Results container infinite scroll handler
    resultsContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = resultsContainer;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            renderNextResultsBatch();
        }
    });

    // Load original file contents
    async function loadFile() {
        try {
            const response = await fetch(`/api/file/${encodeURIComponent(datasetName)}`);
            const data = await response.json();

            if (data.ok && data.lines) {
                fileSpinner.style.display = 'none';
                fileViewer.style.display = 'block';
                
                lines = data.lines;
                
                // 모든 줄을 일반 플로우로 렌더링
                renderAllLines();
            } else {
                throw new Error(data.error || '파일 내용을 로드할 수 없습니다.');
            }
        } catch (err) {
            console.error(err);
            fileSpinner.style.display = 'none';
            fileViewer.style.display = 'block';
            fileViewer.innerHTML = '<div class="empty-result" style="color: #ef4444; margin-top: 100px;">파일 내용을 로드하지 못했습니다.</div>';
        }
    }

    // 모든 줄을 일반 플로우로 렌더링
    function renderAllLines() {
        if (!lines || lines.length === 0) return;

        const fragment = document.createDocumentFragment();

        lines.forEach(line => {
            const wrapper = document.createElement('div');
            wrapper.className = 'line-wrapper';
            wrapper.id = `line-${line.line_number}`;

            wrapper.innerHTML = `
                <div class="line-number-gutter">${line.line_number}</div>
                <div class="line-content">${escapeHtml(line.text)}</div>
            `;
            fragment.appendChild(wrapper);
        });

        fileViewer.innerHTML = '';
        fileViewer.appendChild(fragment);
    }

    // 검색 쿼리에서 순수 텀(검색 키워드)만 추출
    function extractSearchTerms(query) {
        // 괄호와 & 제거
        let cleaned = query.replace(/[()&]/g, ' ');
        let tokens = [];
        let i = 0;
        while (i < cleaned.length) {
            if (cleaned[i] === ' ') {
                i++;
                continue;
            }
            if (cleaned.startsWith('and', i)) {
                i += 3;
                continue;
            }
            if (cleaned.startsWith('or', i)) {
                i += 2;
                continue;
            }
            let start = i;
            while (i < cleaned.length && cleaned[i] !== ' ') {
                if (cleaned.startsWith('and', i)) break;
                if (cleaned.startsWith('or', i)) break;
                i++;
            }
            let term = cleaned.slice(start, i).trim();
            if (term) tokens.push(term);
        }
        return tokens;
    }

    // 검색어 하이라이트를 적용
    function applySearchHighlight(lineElement) {
        if (!currentSearchQuery) return;

        const contentEl = lineElement.querySelector('.line-content');
        if (!contentEl) return;

        const terms = extractSearchTerms(currentSearchQuery);
        if (terms.length === 0) return;

        if (!contentEl.dataset.originalHtml) {
            contentEl.dataset.originalHtml = contentEl.innerHTML;
        }

        let html = contentEl.dataset.originalHtml;

        terms.forEach(term => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            html = html.replace(regex, '<mark class="search-highlight">$1</mark>');
        });

        contentEl.innerHTML = html;
    }

    // 검색어 하이라이트를 제거하고 원본 복원
    function restoreOriginalContent(lineElement) {
        const contentEl = lineElement.querySelector('.line-content');
        if (!contentEl || !contentEl.dataset.originalHtml) return;

        contentEl.innerHTML = contentEl.dataset.originalHtml;
        delete contentEl.dataset.originalHtml;
    }

    // Scroll to specific line in document viewer
    function scrollToLine(lineNumber) {
        if (highlightTimeout) {
            clearTimeout(highlightTimeout);
        }

        if (highlightedLineNumber) {
            const oldTarget = document.getElementById(`line-${highlightedLineNumber}`);
            if (oldTarget) {
                oldTarget.classList.remove('highlight');
                restoreOriginalContent(oldTarget);
            }
        }

        highlightedLineNumber = lineNumber;

        const target = document.getElementById(`line-${lineNumber}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('highlight');
            applySearchHighlight(target);
        }

        highlightTimeout = setTimeout(() => {
            const target = document.getElementById(`line-${lineNumber}`);
            if (target) {
                target.classList.remove('highlight');
                restoreOriginalContent(target);
            }
            highlightedLineNumber = null;
        }, 1500);
    }

    // Drag-to-resize split panes
    const resizer = document.getElementById('resizer');
    const leftPane = document.getElementById('left-pane');
    const mainSplit = document.querySelector('.main-split');
    let isDragging = false;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const containerRect = mainSplit.getBoundingClientRect();
        const newLeftWidth = e.clientX - containerRect.left;

        // Enforce min and max limits (min 300px for left, min 300px for right)
        if (newLeftWidth >= 300 && (containerRect.width - newLeftWidth) >= 300) {
            leftPane.style.width = `${newLeftWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // Helper: HTML escape
    function escapeHtml(value) {
        if (!value) return '';
        return value
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // Initialize on page load
    loadFile();
});

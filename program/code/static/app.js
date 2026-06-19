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

    // ── Virtual Scroll Engine (variable-height aware) ──
    const INITIAL_LINE_HEIGHT = 28;
    const OVERSCAN = 30;
    let lastRenderedStart = -1;
    let lastRenderedEnd = -1;
    let virtualScrollHandler = null;
    let topSpacer = null;
    let bottomSpacer = null;

    // Height measurement cache
    const heightCache = [];                    // actual measured height per line index
    let dynamicEstimate = INITIAL_LINE_HEIGHT;  // running average of measured heights
    let measuredCount = 0;
    let measuredSum = 0;

    function getHeight(idx) {
        return heightCache[idx] !== undefined ? heightCache[idx] : dynamicEstimate;
    }

    // Cumulative offset from top for a given line index
    function getOffsetTop(endIdx) {
        let sum = 0;
        for (let i = 0; i < endIdx; i++) sum += getHeight(i);
        return sum;
    }

    // Total height of lines after endIdx (for bottom spacer)
    function getOffsetBottom(startIdx) {
        let sum = 0;
        for (let i = startIdx + 1; i < lines.length; i++) sum += getHeight(i);
        return sum;
    }

    // Find which line index sits at a given pixel offset
    function getIndexAtOffset(offset) {
        let accum = 0;
        for (let i = 0; i < lines.length; i++) {
            const h = getHeight(i);
            if (accum + h > offset) return i;
            accum += h;
        }
        return lines.length - 1;
    }

    // ── Virtual Scroll: setup ──
    function renderAllLines() {
        if (!lines || lines.length === 0) return;

        if (virtualScrollHandler) {
            rightPane.removeEventListener('scroll', virtualScrollHandler);
        }

        fileViewer.innerHTML = '';

        // Reset height cache
        heightCache.length = 0;
        dynamicEstimate = INITIAL_LINE_HEIGHT;
        measuredCount = 0;
        measuredSum = 0;

        topSpacer = document.createElement('div');
        topSpacer.id = 'vs-top-spacer';
        bottomSpacer = document.createElement('div');
        bottomSpacer.id = 'vs-bottom-spacer';

        fileViewer.appendChild(topSpacer);
        fileViewer.appendChild(bottomSpacer);

        lastRenderedStart = -1;
        lastRenderedEnd = -1;

        virtualScrollHandler = () => {
            requestAnimationFrame(renderVisibleLines);
        };
        rightPane.addEventListener('scroll', virtualScrollHandler, { passive: true });

        // Invalidate height cache when container width changes (text reflows)
        const resizeObserver = new ResizeObserver(() => {
            heightCache.length = 0;
            measuredCount = 0;
            measuredSum = 0;
            dynamicEstimate = INITIAL_LINE_HEIGHT;
            lastRenderedStart = -1;
            lastRenderedEnd = -1;
            renderVisibleLines();
        });
        resizeObserver.observe(rightPane);

        renderVisibleLines();
    }

    // ── Virtual Scroll: render only the visible window ──
    function renderVisibleLines() {
        const scrollTop = rightPane.scrollTop;
        const viewportHeight = rightPane.clientHeight;

        let startIdx = Math.max(0, getIndexAtOffset(scrollTop) - OVERSCAN);
        let endIdx = Math.min(lines.length - 1, getIndexAtOffset(scrollTop + viewportHeight) + OVERSCAN);

        if (startIdx === lastRenderedStart && endIdx === lastRenderedEnd) return;
        lastRenderedStart = startIdx;
        lastRenderedEnd = endIdx;

        // Remove old line elements (between the two spacers)
        while (topSpacer.nextSibling && topSpacer.nextSibling !== bottomSpacer) {
            fileViewer.removeChild(topSpacer.nextSibling);
        }

        // Update spacer heights
        topSpacer.style.height = getOffsetTop(startIdx) + 'px';
        bottomSpacer.style.height = getOffsetBottom(endIdx) + 'px';

        // Build visible lines
        const fragment = document.createDocumentFragment();
        for (let i = startIdx; i <= endIdx; i++) {
            const line = lines[i];
            const wrapper = document.createElement('div');
            wrapper.className = 'line-wrapper';
            wrapper.id = `line-${line.line_number}`;

            const isHighlighted = (line.line_number === highlightedLineNumber);
            if (isHighlighted) wrapper.classList.add('highlight');

            let contentHtml = escapeHtml(line.text);

            if (isHighlighted && currentSearchQuery) {
                const terms = extractSearchTerms(currentSearchQuery);
                terms.forEach(term => {
                    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`(${esc})`, 'gi');
                    contentHtml = contentHtml.replace(regex, '<mark class="search-highlight">$1</mark>');
                });
            }

            wrapper.innerHTML = `
                <div class="line-number-gutter">${line.line_number}</div>
                <div class="line-content">${contentHtml}</div>
            `;
            fragment.appendChild(wrapper);
        }

        fileViewer.insertBefore(fragment, bottomSpacer);

        // Measure actual heights of rendered lines and update cache
        measureRenderedHeights();
    }

    // ── Measure rendered DOM elements and cache their heights ──
    function measureRenderedHeights() {
        let node = topSpacer.nextSibling;
        let idx = lastRenderedStart;
        while (node && node !== bottomSpacer) {
            const h = node.offsetHeight;
            if (h > 0) {
                if (heightCache[idx] === undefined) {
                    measuredCount++;
                    measuredSum += h;
                } else {
                    measuredSum += (h - heightCache[idx]);
                }
                heightCache[idx] = h;
                dynamicEstimate = measuredSum / measuredCount;
            }
            idx++;
            node = node.nextSibling;
        }
    }

    // ── Search term extractor ──
    function extractSearchTerms(query) {
        let cleaned = query.replace(/[()&]/g, ' ');
        let tokens = [];
        let i = 0;
        while (i < cleaned.length) {
            if (cleaned[i] === ' ') { i++; continue; }
            if (cleaned.startsWith('and', i)) { i += 3; continue; }
            if (cleaned.startsWith('or', i)) { i += 2; continue; }
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

    // ── Scroll to specific line (auto-convergence) ──
    let convergenceTimer = null;

    function scrollToLine(lineNumber) {
        if (highlightTimeout) clearTimeout(highlightTimeout);
        if (convergenceTimer) clearTimeout(convergenceTimer);

        highlightedLineNumber = lineNumber;

        const lineIndex = lineNumber - 1;
        if (lineIndex < 0 || lineIndex >= lines.length) return;

        const MAX_ITERATIONS = 5;
        const TOLERANCE_PX = 10;
        let iteration = 0;

        function converge() {
            const targetTop = getOffsetTop(lineIndex);
            const viewportHeight = rightPane.clientHeight;
            const scrollTarget = Math.max(0, targetTop - viewportHeight / 2 + getHeight(lineIndex) / 2);

            const currentError = Math.abs(rightPane.scrollTop - scrollTarget);

            if (iteration > 0 && currentError < TOLERANCE_PX) {
                // Converged — done
                startHighlightTimer();
                return;
            }

            if (iteration >= MAX_ITERATIONS) {
                // Max attempts — stop
                startHighlightTimer();
                return;
            }

            iteration++;

            // Force re-render at the new position
            lastRenderedStart = -1;
            lastRenderedEnd = -1;

            rightPane.scrollTo({ top: scrollTarget, behavior: iteration === 1 ? 'smooth' : 'instant' });
            renderVisibleLines();

            // Wait for render + measurement, then check again
            convergenceTimer = setTimeout(converge, 150);
        }

        function startHighlightTimer() {
            highlightTimeout = setTimeout(() => {
                highlightedLineNumber = null;
                lastRenderedStart = -1;
                lastRenderedEnd = -1;
                renderVisibleLines();
            }, 1500);
        }

        converge();
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

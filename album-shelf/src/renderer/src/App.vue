<template>
  <div class="app">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <h1 class="logo">📀 AlbumShelf</h1>
        <button class="search-online-btn" @click="showSearchModal = true" title="搜索网易云音乐专辑">
          🔍 搜索专辑
        </button>
        <button class="random-pick-btn" @click="handleRandomPick" :disabled="randomPicking || albums.length === 0" title="随机选择一张专辑">
          <span v-if="randomPicking" class="spinner small"></span>
          <span v-else>🎲</span>
          随机选择
        </button>
        <button
          class="view-toggle-btn"
          :title="viewMode === 'table' ? '切换到唱片墙' : '切换到表格视图'"
          @click="toggleViewMode"
        >
          <span v-if="viewMode === 'table'">▦</span>
          <span v-else>☰</span>
        </button>
      </div>
      <div class="toolbar-center">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索专辑名或艺术家..."
            class="search-input"
            @input="debouncedSearch"
          />
          <button v-if="searchQuery" class="search-clear" @click="clearSearch">✕</button>
        </div>
        <!-- 艺术家筛选输入组件 -->
        <div class="artist-filter-container">
          <div class="artist-filter-input-wrapper">
            <input
              v-model="artistInput"
              type="text"
              placeholder="输入艺术家筛选..."
              class="artist-filter-input"
              @focus="onArtistInputFocus"
              @blur="onArtistInputBlur"
              :disabled="!!selectedArtist"
            />
            <span v-if="selectedArtist" class="selected-artist-tag">
              {{ selectedArtist }}
              <button class="selected-artist-remove" @click="clearArtist">✕</button>
            </span>
          </div>
          <!-- 自动完成下拉列表 -->
          <div v-if="showArtistSuggestions && filteredArtistSuggestions().length > 0" class="artist-suggestions">
            <div
              v-for="artist in filteredArtistSuggestions()"
              :key="artist"
              class="artist-suggestion-item"
              @mousedown.prevent="selectArtistSuggestion(artist)"
            >
              {{ artist }}
            </div>
          </div>
        </div>
        <!-- 多风格筛选输入组件 -->
        <div class="genre-filter-container">
          <input
            v-model="genreInput"
            type="text"
            placeholder="输入风格筛选..."
            class="genre-filter-input"
            @focus="onGenreInputFocus"
            @blur="onGenreInputBlur"
            @input="onGenreInputChange"
          />
          <!-- 自动完成下拉列表 -->
          <div v-if="showGenreSuggestions && filteredGenreSuggestions().length > 0" class="genre-suggestions">
            <div
              v-for="genre in filteredGenreSuggestions()"
              :key="genre"
              class="genre-suggestion-item"
              @mousedown.prevent="selectGenreSuggestion(genre)"
            >
              {{ genre }}
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- 已选风格标签区域 -->
    <div v-if="selectedGenres.length > 0" class="selected-genres-bar">
      <span class="selected-genres-label">已选风格：</span>
      <div class="selected-genres-tags">
        <span v-for="genre in selectedGenres" :key="genre" class="selected-genre-tag">
          {{ genre }}
          <button class="selected-genre-remove" @click="removeGenre(genre)">✕</button>
        </span>
        <button class="clear-genres-btn" @click="clearGenres">清除全部</button>
      </div>
    </div>

    <!-- 补全进度条 -->
    <div v-if="enrichProgress" class="enrich-bar">
      <div class="enrich-bar-inner">
        <span class="enrich-text">正在补全 {{ enrichProgress.current }}/{{ enrichProgress.total }}：{{ enrichProgress.albumTitle }}</span>
        <div class="enrich-progress-track">
          <div class="enrich-progress-fill" :style="{ width: (enrichProgress.current / enrichProgress.total * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 封面补全进度条 -->
    <div v-if="coverFillProgress" class="enrich-bar">
      <div class="enrich-bar-inner">
        <span class="enrich-text">正在补全封面 {{ coverFillProgress.current }}/{{ coverFillProgress.total }}：{{ coverFillProgress.albumTitle }}</span>
        <div class="enrich-progress-track">
          <div class="enrich-progress-fill" :style="{ width: (coverFillProgress.current / coverFillProgress.total * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 发行日期回填进度条 -->
    <div v-if="releaseDateFillProgress" class="enrich-bar">
      <div class="enrich-bar-inner">
        <span class="enrich-text">正在回填发行日期 {{ releaseDateFillProgress.current }}/{{ releaseDateFillProgress.total }}：{{ releaseDateFillProgress.albumTitle }}</span>
        <div class="enrich-progress-track">
          <div class="enrich-progress-fill" :style="{ width: (releaseDateFillProgress.current / releaseDateFillProgress.total * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div v-if="message" class="message-bar" :class="messageType">
      <span>{{ message }}</span>
      <button class="message-close" @click="message = ''">✕</button>
    </div>

    <!-- 表格区域 -->
    <main class="table-wrapper" v-if="albums.length > 0 || loadingMore">
      <!-- 表格视图 -->
      <div v-if="viewMode === 'table'" class="table-scroll-container" ref="scrollContainerRef">
        <table class="album-table">
        <thead>
          <tr>
            <th class="col-index">#</th>
            <th class="col-title">专辑</th>
            <th class="col-artist">艺术家</th>
            <th class="col-user-rating sortable" @click="toggleSort('user_rating')" @contextmenu.prevent="cancelSort('user_rating')">
              我的评分
              <span class="sort-arrow" v-if="sortBy === 'user_rating'">{{ sortOrder === 'desc' ? '▼' : '▲' }}</span>
            </th>
            <th class="col-media">实体</th>
            <th class="col-mb-rating sortable" @click="toggleSort('mb_rating')" @contextmenu.prevent="cancelSort('mb_rating')">
              MB评分
              <span class="sort-arrow" v-if="sortBy === 'mb_rating'">{{ sortOrder === 'desc' ? '▼' : '▲' }}</span>
            </th>
            <th class="col-genre">风格</th>
            <th class="col-date sortable" @click="toggleSort('release_date')" @contextmenu.prevent="cancelSort('release_date')">
              发行日期
              <span class="sort-arrow" v-if="sortBy === 'release_date'">{{ sortOrder === 'desc' ? '▼' : '▲' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(album, index) in albums" :key="album.id">
            <tr
              v-memo="[index, album.title, album.artist, album.user_rating, album.physical_media, album.mb_rating, album.release_date, album.genres, selectedAlbumId, playingAlbumId, selectedGenres]"
              class="album-row"
              :class="{ 'row-selected': selectedAlbumId === album.id }"
              @click="toggleSelect(album.id)"
            >
              <td class="col-index">{{ index + 1 }}</td>
              <td class="col-title">
                <div class="album-title-cell">
                  <button
                    class="btn-play btn-play-album"
                    title="播放整张专辑"
                    @click.stop="handlePlayAlbum(album.id)"
                    :disabled="playingAlbumId === album.id"
                  >
                    <span v-if="playingAlbumId === album.id" class="spinner small"></span>
                    <span v-else>▶</span>
                  </button>
                  <div class="album-title">{{ album.title }}</div>
                </div>
              </td>
              <td class="col-artist">{{ album.artist }}</td>
              <td class="col-user-rating">
                <span v-if="album.user_rating != null" class="user-rating-display">
                  <span class="user-stars-readonly">{{ renderStars(album.user_rating) }}</span>
                  <span class="user-rating-num">{{ album.user_rating.toFixed(1) }}</span>
                </span>
                <span v-else class="rating-na">—</span>
              </td>
              <td class="col-media">
                <span v-if="parseMedia(album).length > 0" class="media-chips">
                  <span
                    v-for="m in parseMedia(album)"
                    :key="m"
                    class="media-chip"
                    :title="MEDIA_TYPES.find((t) => t.key === m)?.label || m"
                  >
                    <MediaIcon :type="m" />
                  </span>
                </span>
                <span v-else class="rating-na">—</span>
              </td>
              <td class="col-mb-rating">
                <span v-if="album.mb_rating != null" class="rating-badge">
                  ⭐ {{ album.mb_rating.toFixed(1) }}
                </span>
                <span v-else class="rating-na">—</span>
              </td>
              <td class="col-genre">
                <div class="genre-tags" v-if="album.genres && album.genres.length > 0">
                  <span
                    v-for="genre in album.genres.slice(0, 3)"
                    :key="genre"
                    class="genre-tag clickable"
                    :class="{ selected: isGenreSelected(genre) }"
                    @click.stop="toggleGenre(genre)"
                  >{{ genre }}</span>
                  <span v-if="album.genres.length > 3" class="genre-more">+{{ album.genres.length - 3 }}</span>
                </div>
                <span v-else class="rating-na">—</span>
              </td>
              <td class="col-date">{{ album.release_date || '—' }}</td>
            </tr>
          </template>
          <!-- 哨兵元素和加载更多 -->
          <tr v-if="hasMore || loadingMore" class="sentinel-row">
            <td colspan="8" style="padding: 0; border: none;">
              <div ref="sentinelRef" class="load-more-sentinel">
                <div v-if="loadingMore" class="load-more-spinner">
                  <span class="spinner small"></span>
                  <span>加载中...</span>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <!-- 唱片墙视图 -->
      <div v-else class="grid-scroll-container" ref="scrollContainerRef">
        <!-- 排序工具栏 -->
        <div class="grid-toolbar">
          <span class="grid-toolbar-label">排序：</span>
          <select v-model="gridSortKey" class="grid-sort-select">
            <option value="">默认排序</option>
            <option value="user_rating-desc">我的评分 ↓</option>
            <option value="user_rating-asc">我的评分 ↑</option>
            <option value="mb_rating-desc">MB评分 ↓</option>
            <option value="mb_rating-asc">MB评分 ↑</option>
            <option value="release_date-desc">发行日期 ↓</option>
            <option value="release_date-asc">发行日期 ↑</option>
          </select>
        </div>
        <!-- 封面网格 -->
        <div class="album-grid">
          <div
            v-for="album in albums"
            :key="album.id"
            v-memo="[album.title, album.artist, album.cover_url, album.physical_media, album.user_rating, album.mb_rating, album.release_date, album.genres, sortBy, sortOrder, selectedAlbumId, playingAlbumId, coverErrorSet.has(album.id), coverProtocolFailed.has(album.id)]"
            class="album-card"
            :class="{ 'card-selected': selectedAlbumId === album.id }"
            :data-id="album.id"
            @click="toggleSelect(album.id)"
            @dragstart.prevent
          >
            <img
              v-if="album.cover_url && !coverErrorSet.has(album.id)"
              :src="coverSrc(album)!"
              :alt="album.title"
              class="cover-img"
              draggable="false"
              loading="lazy"
              decoding="async"
              @error="onCoverError(album.id)"
            />
            <div v-else class="cover-placeholder">💿</div>
            <!-- hover 遮罩：专辑名 + 艺术家 -->
            <div class="card-overlay">
              <div class="card-title">{{ album.title }}</div>
              <div class="card-artist">{{ album.artist }}</div>
            </div>
            <!-- 实体介质角标（左上角，常驻显示） -->
            <div v-if="parseMedia(album).length > 0" class="card-media-badges">
              <span
                v-for="m in parseMedia(album)"
                :key="m"
                class="card-media-badge"
                :title="MEDIA_TYPES.find((t) => t.key === m)?.label || m"
              >
                <MediaIcon :type="m" />
              </span>
            </div>
            <!-- 排序角标：按当前排序字段显示对应信息 -->
            <div v-if="cardBadgeText(album)" class="card-badge">{{ cardBadgeText(album) }}</div>
            <!-- 悬停播放按钮（右下角）：点击播放整张专辑，不改变选中状态 -->
            <button
              class="btn-play btn-play-card"
              title="播放整张专辑"
              @click.stop="handlePlayAlbum(album.id)"
              :disabled="playingAlbumId === album.id"
            >
              <span v-if="playingAlbumId === album.id" class="spinner small"></span>
              <span v-else>▶</span>
            </button>
          </div>
          <!-- 哨兵元素和加载更多 -->
          <div v-if="hasMore || loadingMore" ref="sentinelRef" class="load-more-sentinel grid-sentinel">
            <div v-if="loadingMore" class="load-more-spinner">
              <span class="spinner small"></span>
              <span>加载中...</span>
            </div>
          </div>
        </div>
      </div>
      <!-- 滚动进度条 -->
      <ScrollProgressBar
        :scrollContainer="scrollContainerRef"
        @seek="handleScrollSeek"
      />
      <!-- 详情面板（常驻，宽度恒定不引起列表重排） -->
      <aside class="detail-panel">
        <!-- 面板头部 -->
        <div class="panel-header">
          <div class="panel-header-info">
            <template v-if="selectedAlbum">
              <div class="panel-title">{{ selectedAlbum.title }}</div>
              <div class="panel-artist">{{ selectedAlbum.artist }}</div>
            </template>
            <div v-else class="panel-title panel-title-placeholder">专辑详情</div>
          </div>
        </div>
        <!-- 滚动主体 -->
        <div class="panel-body">
          <div class="detail-content" v-if="selectedAlbum">
            <!-- Hero 两栏：封面居左放大，信息居右 -->
            <div class="detail-hero">
              <!-- 封面图（面板仅在选中时渲染内容，天然避免无效图片请求） -->
              <div class="detail-cover" @dragstart.prevent>
                <img
                  v-if="selectedAlbum.cover_url && !coverErrorSet.has(selectedAlbum.id)"
                  :src="coverSrc(selectedAlbum)!"
                  :alt="selectedAlbum.title"
                  class="cover-img"
                  draggable="false"
                  @error="onCoverError(selectedAlbum.id)"
                />
                <div v-else class="cover-placeholder">💿</div>
              </div>
              <!-- 详情信息 -->
              <div class="detail-info">
                <!-- 风格标签完整展示 -->
                <div class="detail-section">
                  <div class="detail-label">
                    风格
                    <button
                      v-if="editingGenreAlbumId !== selectedAlbum.id"
                      class="genre-edit-btn"
                      title="编辑风格标签"
                      @click.stop="startEditGenres(selectedAlbum)"
                    >✏️</button>
                  </div>
                  <!-- 查看态 -->
                  <template v-if="editingGenreAlbumId !== selectedAlbum.id">
                    <div class="genre-tags" v-if="selectedAlbum.genres && selectedAlbum.genres.length > 0">
                      <span
                        v-for="genre in selectedAlbum.genres"
                        :key="genre"
                        class="genre-tag clickable"
                        :class="{ selected: isGenreSelected(genre) }"
                        @click.stop="toggleGenre(genre)"
                      >{{ genre }}</span>
                    </div>
                    <span v-else class="rating-na">—</span>
                  </template>
                  <!-- 编辑态 -->
                  <div v-else class="genre-edit-area" @click.stop>
                    <div class="genre-edit-tags">
                      <span
                        v-for="genre in editingGenres"
                        :key="genre"
                        class="genre-edit-tag"
                      >
                        {{ genre }}
                        <button class="genre-edit-tag-remove" @click.stop="removeEditGenre(genre)">✕</button>
                      </span>
                    </div>
                    <div class="genre-edit-input-container">
                      <input
                        v-model="genreEditInput"
                        type="text"
                        placeholder="输入风格筛选..."
                        class="genre-edit-input"
                        @focus="onGenreEditInputFocus"
                        @blur="onGenreEditInputBlur"
                        @input="onGenreEditInputChange"
                      />
                      <div v-if="showGenreEditSuggestions && filteredGenreEditSuggestions().length > 0" class="genre-edit-suggestions">
                        <div
                          v-for="genre in filteredGenreEditSuggestions()"
                          :key="genre"
                          class="genre-edit-suggestion-item"
                          @mousedown.prevent="selectGenreEditSuggestion(genre)"
                        >
                          {{ genre }}
                        </div>
                      </div>
                    </div>
                    <div class="genre-edit-actions">
                      <button class="genre-edit-save" :disabled="savingGenres" @click.stop="saveEditGenres">
                        {{ savingGenres ? '保存中...' : '保存' }}
                      </button>
                      <button class="genre-edit-cancel" :disabled="savingGenres" @click.stop="cancelEditGenres">取消</button>
                    </div>
                  </div>
                </div>
                <!-- 我的评分 -->
                <div class="detail-section">
                  <div class="detail-label">我的评分</div>
                  <div class="star-rating" @mouseleave="hoverRating = 0">
                    <template v-for="star in 5" :key="star">
                      <span
                        class="star-half star-left"
                        :class="{ filled: (hoverRating || selectedAlbum.user_rating || 0) >= star - 0.5 }"
                        @mouseenter="hoverRating = star - 0.5"
                        @click.stop="handleSetRating(selectedAlbum.id, star - 0.5)"
                      >★</span>
                      <span
                        class="star-half star-right"
                        :class="{ filled: (hoverRating || selectedAlbum.user_rating || 0) >= star }"
                        @mouseenter="hoverRating = star"
                        @click.stop="handleSetRating(selectedAlbum.id, star)"
                      >★</span>
                    </template>
                    <span v-if="selectedAlbum.user_rating != null" class="star-rating-value">{{ selectedAlbum.user_rating.toFixed(1) }}</span>
                  </div>
                </div>
                <!-- 实体收藏 -->
                <div class="detail-section detail-section-media">
                  <div class="detail-label">实体收藏</div>
                  <div class="media-segment">
                    <button
                      v-for="m in MEDIA_TYPES"
                      :key="m.key"
                      class="media-segment-btn"
                      :class="{ active: hasMedia(selectedAlbum, m.key) }"
                      :title="hasMedia(selectedAlbum, m.key) ? `取消${m.label}标记` : `标记为${m.label}`"
                      @click.stop="toggleMedia(selectedAlbum.id, m.key)"
                    >
                      <MediaIcon :type="m.key" />
                      <span>{{ m.label }}</span>
                    </button>
                  </div>
                </div>
                <!-- 元数据信息 -->
                <div class="detail-section detail-meta">
                  <div class="meta-item">
                    <span class="meta-label">MB 评分</span>
                    <span v-if="selectedAlbum.mb_rating != null" class="meta-value rating-badge">⭐ {{ selectedAlbum.mb_rating.toFixed(1) }}</span>
                    <span v-else class="meta-value">—</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">评分人数</span>
                    <span class="meta-value">{{ selectedAlbum.mb_rating_count != null ? selectedAlbum.mb_rating_count : '—' }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">发行日期</span>
                    <span class="meta-value">{{ selectedAlbum.release_date || '—' }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">曲目数</span>
                    <span class="meta-value">{{ selectedAlbum.track_count != null ? selectedAlbum.track_count : '—' }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">总时长</span>
                    <span class="meta-value">{{ albumTotalDuration(selectedAlbum.id) }}</span>
                  </div>
                </div>
                <!-- 外部链接 -->
                <div class="detail-section detail-links">
                  <a
                    v-if="selectedAlbum.musicbrainz_id"
                    class="detail-link"
                    href="#"
                    @click.prevent="openExternal('https://musicbrainz.org/release-group/' + selectedAlbum.musicbrainz_id, $event)"
                  >
                    🔗 MusicBrainz
                  </a>
                  <a
                    v-if="selectedAlbum.netease_original_id"
                    class="detail-link"
                    href="#"
                    @click.prevent="openExternal('https://music.163.com/#/album?id=' + selectedAlbum.netease_original_id, $event)"
                  >
                    🎵 网易云音乐
                  </a>
                </div>
              </div>
            </div>
            <!-- 曲目列表 -->
            <div class="detail-tracklist">
              <div class="tracklist-header">
                <span class="tracklist-title">曲目列表</span>
              </div>
              <div v-if="trackLoading && !trackCache.has(selectedAlbum.id)" class="tracklist-empty">
                加载中...
              </div>
              <div v-else-if="!trackCache.has(selectedAlbum.id) || trackCache.get(selectedAlbum.id)!.length === 0" class="tracklist-empty">
                暂无曲目信息
              </div>
              <div v-else class="tracklist-body">
                <template v-if="isMultiDisc(trackCache.get(selectedAlbum.id)!)">
                  <template v-for="[discNum, discTracks] in groupByDisc(trackCache.get(selectedAlbum.id)!)" :key="discNum">
                    <div class="disc-label">Disc {{ discNum }}</div>
                    <div v-for="(track, tIdx) in discTracks" :key="track.id" class="track-row">
                      <button
                        class="btn-play btn-play-track"
                        title="播放此曲"
                        @click.stop="handlePlayTrack(selectedAlbum.id, track)"
                        :disabled="playingTrackId === track.id"
                      >
                        <span v-if="playingTrackId === track.id" class="spinner small"></span>
                        <span v-else>▶</span>
                      </button>
                      <span class="track-num">{{ track.track_number }}</span>
                      <span class="track-title">{{ track.title }}</span>
                      <span class="track-artist">{{ track.artist || '—' }}</span>
                      <span class="track-duration">{{ formatDuration(track.duration_ms) }}</span>
                    </div>
                  </template>
                </template>
                <template v-else>
                  <div v-for="(track, tIdx) in trackCache.get(selectedAlbum.id)!" :key="track.id" class="track-row">
                    <button
                      class="btn-play btn-play-track"
                      title="播放此曲"
                      @click.stop="handlePlayTrack(selectedAlbum.id, track)"
                      :disabled="playingTrackId === track.id"
                    >
                      <span v-if="playingTrackId === track.id" class="spinner small"></span>
                      <span v-else>▶</span>
                    </button>
                    <span class="track-num">{{ track.track_number }}</span>
                    <span class="track-title">{{ track.title }}</span>
                    <span class="track-artist">{{ track.artist || '—' }}</span>
                    <span class="track-duration">{{ formatDuration(track.duration_ms) }}</span>
                  </div>
                </template>
              </div>
            </div>
            <!-- 网易云热评（仅有关联网易云 ID 的专辑展示） -->
            <div class="detail-comments" v-if="hasNeteaseId(selectedAlbum)">
              <div class="comments-header">
                <span class="comments-title">
                  网易云热评<span v-if="cachedComments(selectedAlbum.id)" class="comments-count">（{{ cachedComments(selectedAlbum.id)!.recordCount }}）</span>
                </span>
                <button
                  class="comments-refresh-btn"
                  title="刷新评论"
                  :disabled="commentLoadingAlbums.has(selectedAlbum.id)"
                  @click.stop="refreshComments(selectedAlbum.id)"
                >🔄</button>
              </div>
              <!-- 失败态 -->
              <div v-if="commentErrors.has(selectedAlbum.id)" class="comments-empty">
                <span>{{ commentErrors.get(selectedAlbum.id) }}</span>
                <button
                  class="btn-retry"
                  :disabled="commentLoadingAlbums.has(selectedAlbum.id)"
                  @click.stop="refreshComments(selectedAlbum.id)"
                >重试</button>
              </div>
              <!-- 加载态 -->
              <div v-else-if="!cachedComments(selectedAlbum.id)" class="comments-empty">
                加载中...
              </div>
              <!-- 空态 -->
              <div v-else-if="cachedComments(selectedAlbum.id)!.comments.length === 0" class="comments-empty">
                暂无评论
              </div>
              <!-- 评论列表 -->
              <div v-else class="comments-body">
                <div v-for="comment in cachedComments(selectedAlbum.id)!.comments" :key="comment.id" class="comment-row">
                  <div v-if="comment.creator.avatarUrl" class="comment-avatar">
                    <img
                      :src="comment.creator.avatarUrl"
                      :alt="comment.creator.nickname"
                      draggable="false"
                      @error="onCommentAvatarError"
                    />
                  </div>
                  <div class="comment-main">
                    <div class="comment-head">
                      <span class="comment-nickname">{{ comment.creator.nickname }}</span>
                      <span class="comment-time">{{ formatCommentTime(comment.time) }}</span>
                    </div>
                    <div class="comment-content">{{ comment.content }}</div>
                    <div class="comment-like">👍 {{ comment.likedCount }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 占位态：未选中专辑时显示 -->
          <div v-else class="panel-empty">
            <div class="panel-empty-icon">💿</div>
            <div class="panel-empty-text">点击左侧专辑查看详情</div>
          </div>
        </div>
      </aside>
    </main>

    <!-- 空状态 -->
    <main class="empty-state" v-else-if="!loading">
      <div class="empty-icon">📀</div>
      <h2>还没有专辑数据</h2>
      <p>点击菜单栏「数据 → 同步专辑列表」从网易云音乐导入你的收藏专辑</p>
    </main>

    <!-- 加载状态 -->
    <main class="loading-state" v-else>
      <div class="spinner large"></div>
      <p>正在加载...</p>
    </main>

    <!-- 底部常驻播放条（播放会话存活时显示） -->
    <PlayerBar
      v-if="nowPlaying"
      :album-id="nowPlaying.albumId"
      :cover-url="nowPlaying.coverUrl"
      :track-title="nowPlaying.trackTitle"
      :track-artist="nowPlaying.trackArtist"
      :status="playback.status"
      :position="displayPosition"
      :duration="playback.duration"
      :volume="volume"
      @cover-click="handlePlayerCoverClick"
      @toggle="handleTogglePlay"
      @next="handlePlayerNext"
      @prev="handlePlayerPrev"
      @seek="handlePlayerSeek"
      @volume="handlePlayerVolume"
      @mute-toggle="handleVolumeMuteToggle"
      @stop="handlePlayerStop"
    />

    <!-- 登录弹窗 -->
    <LoginModal
      :visible="showLoginModal"
      @close="showLoginModal = false"
      @loginSuccess="handleLoginSuccess"
    />

    <!-- 登录引导弹窗 -->
    <LoginGuideModal
      :visible="showLoginGuide"
      @login="handleLoginGuideLogin"
      @later="showLoginGuide = false"
    />

    <!-- 模糊匹配逐条确认弹窗（补全流程中自动弹出） -->
    <FuzzyMatchModal />

    <!-- 设置弹窗（菜单栏触发） -->
    <SettingsModal />

    <!-- 在线搜索弹窗 -->
    <AlbumSearchModal
      :visible="showSearchModal"
      @close="showSearchModal = false"
      @added="handleSearchAlbumAdded"
    />

    <!-- 风格统计弹窗 -->
    <GenreStatsModal
      :visible="showGenreStatsModal"
      @close="showGenreStatsModal = false"
      @select-genre="handleSelectGenreFromStats"
    />

    <!-- 关于弹窗 -->
    <AboutModal
      :visible="showAboutModal"
      @close="showAboutModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import LoginModal from './LoginModal.vue'
import LoginGuideModal from './LoginGuideModal.vue'
import FuzzyMatchModal from './FuzzyMatchModal.vue'
import ScrollProgressBar from './ScrollProgressBar.vue'
import AlbumSearchModal from './AlbumSearchModal.vue'
import SettingsModal from './SettingsModal.vue'
import GenreStatsModal from './GenreStatsModal.vue'
import AboutModal from './AboutModal.vue'
import PlayerBar from './PlayerBar.vue'
import MediaIcon from './MediaIcon.vue'

// ==================== 状态 ====================

interface Album {
  id: number
  title: string
  artist: string
  mb_rating: number | null
  mb_rating_count: number | null
  user_rating: number | null
  physical_media: string | null
  release_date: string | null
  genres?: string[]
  cover_url?: string | null
  netease_album_id?: string | null
  netease_original_id?: number | null
  musicbrainz_id?: string | null
  track_count?: number | null
  synced_at?: string | null
  enriched_at?: string | null
}

const albums = ref<Album[]>([])
const loading = ref(true)
const syncing = ref(false)

// 视图模式：表格/网格（持久化到 localStorage，默认表格）
const viewMode = ref<'table' | 'grid'>(
  (() => {
    try {
      return localStorage.getItem('albumShelfViewMode') === 'grid' ? 'grid' : 'table'
    } catch {
      return 'table'
    }
  })()
)

watch(viewMode, (mode) => {
  try {
    localStorage.setItem('albumShelfViewMode', mode)
  } catch {
    // 忽略存储失败
  }
})

// 在线搜索弹窗
const showSearchModal = ref(false)

// 风格统计弹窗
const showGenreStatsModal = ref(false)
let removeMenuGenreStatsListener: (() => void) | null = null

// 关于弹窗
const showAboutModal = ref(false)
let removeMenuAboutListener: (() => void) | null = null

// 选中的专辑（详情抽屉）
const selectedAlbumId = ref<number | null>(null)
const selectedAlbum = computed<Album | null>(
  () => albums.value.find((a) => a.id === selectedAlbumId.value) ?? null
)

function toggleSelect(albumId: number) {
  selectedAlbumId.value = selectedAlbumId.value === albumId ? null : albumId
}

// 关闭详情抽屉（✕ 按钮 / Esc）
function closeDetail() {
  selectedAlbumId.value = null
}

// Esc 关闭详情抽屉（App 级弹窗打开时不响应，避免弹窗上按 Esc 误关抽屉）
function handleDetailKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (
    showLoginModal.value ||
    showLoginGuide.value ||
    showSearchModal.value ||
    showGenreStatsModal.value ||
    showAboutModal.value
  ) {
    return
  }
  closeDetail()
}

interface Track {
  id: number
  album_id: number
  netease_song_id: string | null
  netease_original_id: number | null
  title: string
  artist: string | null
  track_number: number
  disc_number: number
  duration_ms: number | null
  created_at: string
}

const trackCache = ref<Map<number, Track[]>>(new Map())
const trackLoading = ref(false)

// 加载曲目数据
async function loadTracks(albumId: number) {
  if (trackCache.value.has(albumId)) return
  trackLoading.value = true
  try {
    const result = await window.api.trackListByAlbum(albumId)
    if (result.success && result.data) {
      trackCache.value.set(albumId, result.data)
    }
  } catch (error) {
    console.error('加载曲目失败:', error)
  } finally {
    trackLoading.value = false
  }
}

// 已尝试过远程获取封面的专辑（防止无限重试）
const coverFetchedSet = new Set<number>()
// 封面加载请求去重：避免同一专辑并发多次请求
const coverLoadingSet = new Set<number>()

// 从 ncm-cli 获取封面并替换旧的无效 URL
async function fetchCoverFromRemote(albumId: number) {
  const album = albums.value.find((a) => a.id === albumId)
  if (!album) return

  // 已经尝试过获取的不再重试，防止无限循环
  if (coverFetchedSet.has(albumId)) return

  // 防止并发重复请求
  if (coverLoadingSet.has(albumId)) return
  coverLoadingSet.add(albumId)

  try {
    coverFetchedSet.add(albumId)
    // force=true 告知后端忽略数据库已有值，从 ncm-cli 重新获取
    const result = await window.api.albumFetchCover(albumId, true)
    if (result.success && result.data?.cover_url) {
      // 清除错误标记，让 img 重新渲染
      const newSet = new Set(coverErrorSet.value)
      newSet.delete(albumId)
      coverErrorSet.value = newSet
      // 用新 URL 替换（后端已持久化到数据库）
      album.cover_url = result.data.cover_url
      // 新 URL 可能可以正常缓存，重置协议失败标记让 cover:// 重新尝试
      const failedSet = new Set(coverProtocolFailed.value)
      failedSet.delete(albumId)
      coverProtocolFailed.value = failedSet
    }
  } catch (error) {
    console.error('获取封面失败:', error)
  } finally {
    coverLoadingSet.delete(albumId)
  }
}

// ==================== 网易云热评 ====================
// 热评只做内存缓存 + TTL（热评会变化，不做持久化缓存）
const COMMENT_CACHE_TTL = 5 * 60 * 1000 // 5 分钟

interface NcmComment {
  id: string
  content: string
  likedCount: number
  creator: {
    originalId: number
    nickname: string
    avatarUrl: string | null
  }
  time: number
}

interface CommentCacheEntry {
  recordCount: number
  comments: NcmComment[]
  fetchedAt: number
}

const commentCache = ref<Map<number, CommentCacheEntry>>(new Map())
// 进行中请求去重：避免快速切换专辑时并发重复请求
const commentLoadingAlbums = ref<Set<number>>(new Set())
const commentErrors = ref<Map<number, string>>(new Map())

// TTL 内的有效缓存；无缓存或已过期返回 null
function cachedComments(albumId: number): CommentCacheEntry | null {
  const cached = commentCache.value.get(albumId)
  if (!cached) return null
  if (Date.now() - cached.fetchedAt >= COMMENT_CACHE_TTL) return null
  return cached
}

async function loadComments(albumId: number, force = false) {
  // TTL 内命中缓存且非强制刷新，直接返回
  if (!force && cachedComments(albumId)) return
  // 进行中请求去重
  if (commentLoadingAlbums.value.has(albumId)) return

  const loadingSet = new Set(commentLoadingAlbums.value)
  loadingSet.add(albumId)
  commentLoadingAlbums.value = loadingSet

  // 清除旧错误标记
  const errors = new Map(commentErrors.value)
  errors.delete(albumId)
  commentErrors.value = errors

  try {
    const result = await window.api.albumComments(albumId)
    if (result.success && result.data) {
      const cache = new Map(commentCache.value)
      cache.set(albumId, {
        recordCount: result.data.recordCount,
        comments: result.data.comments,
        fetchedAt: Date.now()
      })
      commentCache.value = cache
    } else {
      const newErrors = new Map(commentErrors.value)
      newErrors.set(
        albumId,
        result.loginRequired ? '请先登录网易云音乐账号' : result.error || '加载失败'
      )
      commentErrors.value = newErrors
    }
  } catch (error) {
    console.error('加载热评失败:', error)
    const newErrors = new Map(commentErrors.value)
    newErrors.set(albumId, '加载失败')
    commentErrors.value = newErrors
  } finally {
    const doneSet = new Set(commentLoadingAlbums.value)
    doneSet.delete(albumId)
    commentLoadingAlbums.value = doneSet
  }
}

// 刷新按钮：忽略 TTL 强制重新拉取
function refreshComments(albumId: number) {
  loadComments(albumId, true)
}

// 专辑是否有关联网易云 ID（无 ID 时隐藏评论区块）
function hasNeteaseId(album: Album): boolean {
  return Boolean(album.netease_album_id)
}

// 评论头像加载失败时隐藏图片
function onCommentAvatarError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

// 格式化评论时间（毫秒时间戳 → YYYY-MM-DD）
function formatCommentTime(timestamp: number): string {
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 选中时自动加载曲目；若无封面则尝试获取；取消选中时重置风格编辑态
watch(selectedAlbumId, (newId) => {
  if (newId != null) {
    loadTracks(newId)
    // 仅当 cover_url 为空时主动获取
    const album = albums.value.find((a) => a.id === newId)
    if (album && !album.cover_url) {
      fetchCoverFromRemote(newId)
    }
    // 有关联网易云 ID 时自动加载热评（TTL 内命中缓存则不请求）
    if (album?.netease_album_id) {
      loadComments(newId)
    }
  } else {
    // 所有关闭路径（✕/Esc/再点同行/筛选过滤掉）统一收敛：退出风格编辑态
    cancelEditGenres()
  }
})

// 计算专辑总时长
function albumTotalDuration(albumId: number): string {
  const tracks = trackCache.value.get(albumId)
  if (!tracks || tracks.length === 0) return '—'
  let totalMs = 0
  for (const t of tracks) {
    if (t.duration_ms != null) totalMs += t.duration_ms
  }
  if (totalMs === 0) return '—'
  const totalSeconds = Math.floor(totalMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 格式化时长 (ms -> m:ss)
function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 判断是否多碟专辑
function isMultiDisc(tracks: Track[]): boolean {
  if (tracks.length === 0) return false
  return new Set(tracks.map((t) => t.disc_number)).size > 1
}

// 按碟片分组
function groupByDisc(tracks: Track[]): Map<number, Track[]> {
  const groups = new Map<number, Track[]>()
  for (const track of tracks) {
    const disc = track.disc_number
    if (!groups.has(disc)) groups.set(disc, [])
    groups.get(disc)!.push(track)
  }
  return groups
}

function openExternal(url: string, event: Event) {
  event.stopPropagation()
  window.api.openExternal(url)
}

// ==================== 用户评分 ====================

const hoverRating = ref(0)

// 渲染只读星星（用于列表行）
function renderStars(rating: number): string {
  let stars = ''
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars += '★'
    } else if (rating >= i - 0.5) {
      stars += '⯨'
    } else {
      stars += '☆'
    }
  }
  return stars
}

// 设置评分（乐观更新）
async function handleSetRating(albumId: number, rating: number) {
  const album = albums.value.find((a) => a.id === albumId)
  if (!album) return

  const oldRating = album.user_rating
  // 乐观更新
  album.user_rating = rating

  try {
    const result = await window.api.albumSetRating(albumId, rating)
    if (!result.success) {
      // 回退
      album.user_rating = oldRating
      showMessage(`评分失败：${result.error}`, 'error')
    }
  } catch (error) {
    // 回退
    album.user_rating = oldRating
    showMessage('评分失败：未知错误', 'error')
  }
}

// ==================== 实体介质标记 ====================

/** 介质类型封闭集合（展示顺序即存储排序顺序） */
const MEDIA_TYPES = [
  { key: 'vinyl', label: '黑胶' },
  { key: 'cd', label: 'CD' },
  { key: 'cassette', label: '磁带' },
] as const
type MediaType = (typeof MEDIA_TYPES)[number]['key']

/** 解析逗号分隔的介质标记为数组（按展示顺序） */
function parseMedia(album: Album): MediaType[] {
  if (!album.physical_media) return []
  return album.physical_media.split(',').filter((m): m is MediaType =>
    MEDIA_TYPES.some((t) => t.key === m)
  )
}

/** 专辑是否标记了某介质 */
function hasMedia(album: Album, type: MediaType): boolean {
  return parseMedia(album).includes(type)
}

// 切换介质标记（乐观更新）
async function toggleMedia(albumId: number, type: MediaType) {
  const album = albums.value.find((a) => a.id === albumId)
  if (!album) return

  const oldValue = album.physical_media
  const set = new Set(parseMedia(album))
  if (set.has(type)) {
    set.delete(type)
  } else {
    set.add(type)
  }
  const ordered = MEDIA_TYPES.map((m) => m.key).filter((k) => set.has(k))
  // 乐观更新
  album.physical_media = ordered.length > 0 ? ordered.join(',') : null

  try {
    const result = await window.api.albumSetPhysicalMedia(
      albumId,
      ordered.length > 0 ? ordered : null
    )
    if (!result.success) {
      // 回退
      album.physical_media = oldValue
      showMessage(`标记失败：${result.error}`, 'error')
    }
  } catch (error) {
    // 回退
    album.physical_media = oldValue
    showMessage('标记失败：未知错误', 'error')
  }
}

// ==================== 播放状态 ====================

const playingAlbumId = ref<number | null>(null)
const playingTrackId = ref<number | null>(null)

/** 正在播放的曲目上下文：本地元数据 + 队列快照（ncm-cli state 不含专辑名，由本地提供） */
const nowPlaying = ref<{
  albumId: number | null
  albumTitle: string
  /** 专辑原始封面 URL（cover:// 协议失败时回退用） */
  coverUrl: string | null
  trackTitle: string
  trackArtist: string
  /** 本地队列快照（发起播放时构建，next/prev 后按 currentIndex 更新标题/艺术家） */
  queue: { title: string; artist: string }[]
} | null>(null)

/**
 * 播放器运行时状态
 * status 以本地为权威：ncm-cli pause 后 state.status 也返回 'stopped'（实测），
 * 会话是否存活需结合 state.queueLength 判定，不能依赖 state.status。
 */
const playback = reactive({
  status: 'stopped' as 'stopped' | 'playing' | 'paused' | 'unknown',
  /** state 锚点位置（秒） */
  position: 0,
  /** 锚点采样时刻（performance.now），用于轮询间隔内插值 */
  anchorAt: 0,
  duration: 0,
  currentIndex: 0
})

// ==================== 音量控制 ====================

// 音量由应用本地管理：ncm-cli 无音量读取命令（state.volume 恒为 null），
// UI 是唯一事实源，localStorage 持久化，播放会话启动时应用到后端。
const VOLUME_STORAGE_KEY = 'albumShelfPlayerVolume'
const DEFAULT_VOLUME = 100

function loadStoredVolume(): number {
  const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
  const parsed = raw === null ? NaN : Number(raw)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : DEFAULT_VOLUME
}

const volume = ref(loadStoredVolume())
/** 静音前的非零音量（图标点击在 0 ↔ lastNonZeroVolume 间切换） */
let lastNonZeroVolume = volume.value > 0 ? volume.value : DEFAULT_VOLUME

// 轮询间隔：播放中 1s、暂停中 3s（每次 state 是一次子进程调用，需克制频率）
const PLAYER_POLL_PLAYING_MS = 1000
const PLAYER_POLL_IDLE_MS = 3000
let playerPollTimer: ReturnType<typeof setInterval> | null = null

/**
 * 会话存活确认：playSong 返回后播放器后端可能尚未就绪，立即轮询会读到
 * queueLength 0 而误判会话结束。仅在观察到 queueLength > 0 之后，
 * 队列再次清空才判定为会话结束。
 */
let playerSessionSeenActive = false

/**
 * seek 宽限期：跳转命令发出时，可能有一个进行中的轮询带着旧 position 晚到，
 * 回写会令进度条回跳。跳转后 2 秒内忽略轮询的 position 回写。
 */
let seekGraceUntil = 0

// rAF 心跳：playing 时驱动进度插值重算（computed 仅在依赖变化时求值，需持续心跳）
let progressRafId: number | null = null
const progressTick = ref(0)

/** 插值后的展示进度：playing 时从锚点按时间线性推进，保证 1s 轮询间隔内平滑 */
const displayPosition = computed(() => {
  if (playback.status !== 'playing') return playback.position
  void progressTick.value // 依赖 rAF 心跳持续重算
  const elapsed = (performance.now() - playback.anchorAt) / 1000
  const pos = playback.position + elapsed
  return playback.duration > 0 ? Math.min(pos, playback.duration) : pos
})

function tickProgress(): void {
  progressTick.value = performance.now()
  progressRafId = requestAnimationFrame(tickProgress)
}

function startProgressTicker(): void {
  if (progressRafId !== null) return
  progressRafId = requestAnimationFrame(tickProgress)
}

function stopProgressTicker(): void {
  if (progressRafId !== null) {
    cancelAnimationFrame(progressRafId)
    progressRafId = null
  }
}

// 播放中启动进度心跳，暂停/停止即停
watch(
  () => playback.status,
  (s) => {
    if (s === 'playing') startProgressTicker()
    else stopProgressTicker()
  }
)

/** 解析 state.title 合并串 "歌名 - 艺术家-"（剥离艺术家尾部 "-" 怪癖） */
function parseStateTitle(title: string): { track: string; artist: string } {
  const cleaned = title.trim().replace(/-+$/, '').trim()
  const idx = cleaned.lastIndexOf(' - ')
  if (idx === -1) return { track: cleaned, artist: '' }
  return { track: cleaned.slice(0, idx).trim(), artist: cleaned.slice(idx + 3).trim() }
}

/** 轮询播放器状态：锚点更新 + 本地快照推进标题/艺术家 + 队列清空判定会话结束 */
async function pollPlayerState(): Promise<void> {
  const result = await window.api.playerState()
  if (!result.success || !result.data) {
    return // 单次失败保留上次状态，静默重试
  }
  const state = result.data

  if (performance.now() >= seekGraceUntil) {
    playback.position = state.position ?? playback.position
  }
  playback.duration = state.duration ?? playback.duration
  playback.currentIndex = state.currentIndex
  playback.anchorAt = performance.now()

  // 队列清空 = 播放会话结束 → 停止轮询并隐藏播放条
  // （会话尚未观察到存活时不判定结束，规避播放启动瞬间后端未就绪的误杀）
  if (state.queueLength === 0) {
    if (!playerSessionSeenActive) return
    stopPlayerPolling()
    nowPlaying.value = null
    playback.status = 'stopped'
    return
  }
  playerSessionSeenActive = true

  // 曲目标题/艺术家：本地队列快照优先；无快照（应用外启动的播放）时用 state.title 兜底
  if (nowPlaying.value) {
    const snap = nowPlaying.value.queue[state.currentIndex]
    if (snap) {
      nowPlaying.value.trackTitle = snap.title
      nowPlaying.value.trackArtist = snap.artist
    } else if (state.title) {
      const parsed = parseStateTitle(state.title)
      nowPlaying.value.trackTitle = parsed.track
      nowPlaying.value.trackArtist = parsed.artist
    }
  }

  // 仅当 state 确认 playing 时同步回放状态（本地 pause 动作已先行置位，此处不回写冲突）
  if (state.status === 'playing' && playback.status !== 'playing') {
    playback.status = 'playing'
  }
}

function startPlayerPolling(): void {
  stopPlayerPolling()
  playerPollTimer = setInterval(pollPlayerState, PLAYER_POLL_PLAYING_MS)
}

/** 按当前状态调整轮询间隔（pause 后 state.status 为 'stopped'，间隔以本地状态为准） */
function adjustPlayerPollInterval(): void {
  if (!playerPollTimer) return
  clearInterval(playerPollTimer)
  const interval = playback.status === 'playing' ? PLAYER_POLL_PLAYING_MS : PLAYER_POLL_IDLE_MS
  playerPollTimer = setInterval(pollPlayerState, interval)
}

function stopPlayerPolling(): void {
  if (playerPollTimer) {
    clearInterval(playerPollTimer)
    playerPollTimer = null
  }
}

/** 播放成功后初始化播放上下文：本地元数据 + 队列快照 + 启动轮询 */
function beginPlaybackContext(context: {
  albumId: number | null
  albumTitle: string
  coverUrl: string | null
  tracks: Track[]
}): void {
  nowPlaying.value = {
    albumId: context.albumId,
    albumTitle: context.albumTitle,
    coverUrl: context.coverUrl,
    trackTitle: context.tracks[0]?.title || '',
    trackArtist: context.tracks[0]?.artist || '',
    queue: context.tracks.map((t) => ({ title: t.title, artist: t.artist || '' }))
  }
  playback.status = 'playing'
  playback.position = 0
  playback.duration = 0
  playback.currentIndex = 0
  playback.anchorAt = performance.now()
  playerSessionSeenActive = false
  startPlayerPolling()
  pollPlayerState() // 立即拉取一次，快速获得 duration 等初始状态
  // 会话启动时把本地音量应用到后端（后端无读取渠道，可能被外部修改过）
  void window.api.playerSetVolume(volume.value).then((r) => {
    if (!r.success) console.warn('应用音量失败:', r.error)
  })
}

async function handlePlayAlbum(albumId: number) {
  if (playingAlbumId.value !== null) return
  playingAlbumId.value = albumId

  try {
    const result = await window.api.playerPlayAlbum(albumId)
    if (!result.success) {
      console.error('播放专辑失败:', result.error)
      return
    }
    // 主进程已确保曲目入库（缺失时自动拉取），取本地曲目构建队列快照
    await loadTracks(albumId)
    const tracks = trackCache.value.get(albumId) || []
    const album = albums.value.find((a) => a.id === albumId)
    beginPlaybackContext({
      albumId,
      albumTitle: album?.title || '',
      coverUrl: album?.cover_url || null,
      tracks
    })
  } catch (error) {
    console.error('播放专辑失败:', error)
  } finally {
    playingAlbumId.value = null
  }
}

async function handlePlayTrack(_albumId: number, track: Track) {
  if (playingTrackId.value !== null) return
  if (!track.netease_song_id || !track.netease_original_id) {
    console.error('该曲目缺少歌曲 ID，无法播放')
    return
  }
  playingTrackId.value = track.id

  try {
    const result = await window.api.playerPlaySong(
      track.netease_song_id,
      track.netease_original_id
    )
    if (!result.success) {
      console.error('播放曲目失败:', result.error)
      return
    }
    const album = albums.value.find((a) => a.id === _albumId)
    beginPlaybackContext({
      albumId: _albumId,
      albumTitle: album?.title || '',
      coverUrl: album?.cover_url || null,
      tracks: [track]
    })
  } catch (error) {
    console.error('播放曲目失败:', error)
  } finally {
    playingTrackId.value = null
  }
}

/** 播放/暂停切换（本地状态先行置位，失败回退） */
async function handleTogglePlay(): Promise<void> {
  if (!nowPlaying.value) return
  if (playback.status === 'playing') {
    playback.status = 'paused'
    adjustPlayerPollInterval()
    const result = await window.api.playerPause()
    if (!result.success) {
      playback.status = 'playing'
      adjustPlayerPollInterval()
      showMessage(`暂停失败：${result.error}`, 'error')
    }
  } else {
    playback.status = 'playing'
    playback.anchorAt = performance.now()
    adjustPlayerPollInterval()
    const result = await window.api.playerResume()
    if (!result.success) {
      playback.status = 'paused'
      adjustPlayerPollInterval()
      showMessage(`播放失败：${result.error}`, 'error')
    }
  }
}

/** 下一首：乐观更新本地快照显示，下一轮 state 回填 currentIndex 后保持一致 */
async function handlePlayerNext(): Promise<void> {
  const result = await window.api.playerNext()
  if (result.boundary) {
    showMessage(result.message || '已是最后一首', 'info')
    return
  }
  if (!result.success) {
    showMessage(`下一首失败：${result.error}`, 'error')
    return
  }
  if (nowPlaying.value) {
    const nextIdx = Math.min(playback.currentIndex + 1, nowPlaying.value.queue.length - 1)
    const snap = nowPlaying.value.queue[nextIdx]
    if (snap) {
      nowPlaying.value.trackTitle = snap.title
      nowPlaying.value.trackArtist = snap.artist
      playback.currentIndex = nextIdx
    }
  }
  playback.position = 0
  playback.anchorAt = performance.now()
}

/** 上一首（乐观更新逻辑同 next） */
async function handlePlayerPrev(): Promise<void> {
  const result = await window.api.playerPrev()
  if (result.boundary) {
    showMessage(result.message || '已是第一首', 'info')
    return
  }
  if (!result.success) {
    showMessage(`上一首失败：${result.error}`, 'error')
    return
  }
  if (nowPlaying.value) {
    const prevIdx = Math.max(playback.currentIndex - 1, 0)
    const snap = nowPlaying.value.queue[prevIdx]
    if (snap) {
      nowPlaying.value.trackTitle = snap.title
      nowPlaying.value.trackArtist = snap.artist
      playback.currentIndex = prevIdx
    }
  }
  playback.position = 0
  playback.anchorAt = performance.now()
}

/** 进度跳转：锚点先行（PlayerBar 拖动期间已本地预览），宽限期内忽略轮询旧值回写 */
async function handlePlayerSeek(seconds: number): Promise<void> {
  playback.position = seconds
  playback.anchorAt = performance.now()
  seekGraceUntil = performance.now() + 2000
  const result = await window.api.playerSeek(seconds)
  if (!result.success) {
    showMessage(`跳转失败：${result.error}`, 'error')
  }
}

/** 音量调整：本地先行（滑块拖动期间已本地预览），持久化并应用到后端，失败回滚 */
async function handlePlayerVolume(level: number): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(level)))
  const previous = volume.value
  volume.value = clamped
  if (clamped > 0) lastNonZeroVolume = clamped
  localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped))
  const result = await window.api.playerSetVolume(clamped)
  if (!result.success) {
    volume.value = previous
    localStorage.setItem(VOLUME_STORAGE_KEY, String(previous))
    showMessage(`音量设置失败：${result.error}`, 'error')
  }
}

/** 静音切换（图标点击）：在 0 ↔ 上次非零音量 间切换 */
function handleVolumeMuteToggle(): void {
  void handlePlayerVolume(volume.value > 0 ? 0 : lastNonZeroVolume)
}

/** 停止播放（播放条关闭按钮）：清空队列并隐藏播放条 */
async function handlePlayerStop(): Promise<void> {
  stopPlayerPolling()
  nowPlaying.value = null
  playback.status = 'stopped'
  playback.position = 0
  playback.duration = 0
  const result = await window.api.playerStop()
  if (!result.success) {
    showMessage(`停止失败：${result.error}`, 'error')
  }
}

/**
 * 点击播放条封面：详情面板定位到当前播放专辑。
 * 专辑在当前列表时直接选中；被搜索/筛选/分页过滤时清除过滤条件、
 * 分页加载并滚动定位后选中（复用随机选择/移除筛选的定位机制）。
 */
function handlePlayerCoverClick(): void {
  if (!nowPlaying.value || nowPlaying.value.albumId === null) return
  const albumId = nowPlaying.value.albumId
  if (albums.value.some((a) => a.id === albumId)) {
    selectedAlbumId.value = albumId
    return
  }
  // 清除过滤条件（镜像 handleRandomPick 的清条件逻辑）
  searchQuery.value = ''
  selectedArtist.value = ''
  artistInput.value = ''
  selectedGenres.value = []
  genreInput.value = ''
  sortBy.value = undefined
  sortOrder.value = 'desc'
  // 重置分页并定位：fetchAlbumsAndScrollTo 持续分页直到找到目标专辑
  albums.value = []
  currentPage.value = 1
  hasMore.value = true
  void fetchAlbumsAndScrollTo(albumId).then(() => {
    selectedAlbumId.value = albumId
  })
}

const coverErrorSet = ref<Set<number>>(new Set())

// cover:// 协议加载失败（本地缓存下载失败/离线且未缓存）的专辑，回退为直接加载远程 URL
const coverProtocolFailed = ref<Set<number>>(new Set())

// 封面地址：优先走 cover:// 本地缓存协议，协议失败后回退远程 URL
function coverSrc(album: { id: number; cover_url?: string | null }): string | null {
  if (!album.cover_url) return null
  if (coverProtocolFailed.value.has(album.id)) return album.cover_url
  return `cover://album/${album.id}`
}

function onCoverError(albumId: number) {
  // 第一级：cover:// 失败 → 标记后回退远程 URL（src 变化自动重渲染，不进入错误态）
  if (!coverProtocolFailed.value.has(albumId)) {
    coverProtocolFailed.value = new Set(coverProtocolFailed.value).add(albumId)
    return
  }
  // 第二级：远程 URL 也失败 → 占位图 + 走现有补全流程
  coverErrorSet.value = new Set(coverErrorSet.value).add(albumId)
  fetchCoverFromRemote(albumId)
}

// 搜索 & 筛选
const searchQuery = ref('')
const selectedArtist = ref('')
const selectedGenres = ref<string[]>([])  // 多风格筛选
const artists = ref<string[]>([])
const genres = ref<string[]>([])

// 风格输入相关
const genreInput = ref('')
const showGenreSuggestions = ref(false)

// 艺术家输入相关
const artistInput = ref('')
const showArtistSuggestions = ref(false)

// 排序
const sortBy = ref<'mb_rating' | 'release_date' | 'user_rating' | undefined>(undefined)
const sortOrder = ref<'asc' | 'desc'>('desc')

// 无限滚动
const currentPage = ref(1)
const totalAlbums = ref(0)
// 分页尺寸：唱片墙卡片小，每页加载更多（40 张约 2-4 行）
const pageSize = computed(() => (viewMode.value === 'grid' ? 40 : 20))
const loadingMore = ref(false)
// 全量加载中（跳转定位/深拖到底时一次拉取完整结果集）
const loadingAll = ref(false)
const hasMore = ref(true)

// 滚动容器和哨兵
const scrollContainerRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
let intersectionObserver: IntersectionObserver | null = null

// 消息提示
const message = ref('')
const messageType = ref<'success' | 'error' | 'info'>('info')

// 补全进度
const enrichProgress = ref<{ current: number; total: number; albumTitle: string } | null>(null)

// 封面补全进度
const coverFillProgress = ref<{ current: number; total: number; albumTitle: string; filled: number } | null>(null)

// 发行日期回填进度
const releaseDateFillProgress = ref<{ current: number; total: number; albumTitle: string; filled: number } | null>(null)

// ==================== 数据获取 ====================

// 构建统一的查询参数（筛选/排序/分页），分页加载与全量加载路径共用
function buildAlbumQueryOptions() {
  return {
    search: searchQuery.value || undefined,
    artist: selectedArtist.value || undefined,
    genres: selectedGenres.value.length > 0 ? selectedGenres.value.join(',') : undefined,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    page: currentPage.value,
    pageSize: pageSize.value
  }
}

// 应用全量查询结果（fetchAll 模式）：整列表替换，不再有更多分页
function applyFullResult(result: { albums: Album[]; total: number }): void {
  albums.value = result.albums
  totalAlbums.value = result.total
  hasMore.value = false
  currentPage.value = 1
}

async function fetchAlbums(append = false) {
  try {
    const result = await window.api.albumList(buildAlbumQueryOptions())

    if (result.success && result.data) {
      if (append) {
        // 过期分页结果丢弃：期间列表被重置/全量替换（page 不匹配）时避免追加重复行
        if (result.data.page !== currentPage.value) return
        // 追加模式：将新数据添加到现有列表
        albums.value = [...albums.value, ...result.data.albums]
      } else {
        // 重置模式：替换整个列表
        albums.value = result.data.albums
      }
      totalAlbums.value = result.data.total
      currentPage.value = result.data.page
      // 判断是否还有更多数据
      hasMore.value = albums.value.length < result.data.total
    }
  } catch (error) {
    showMessage('加载专辑列表失败', 'error')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// 加载更多
async function loadMore() {
  if (loadingMore.value || loadingAll.value || !hasMore.value) return
  loadingMore.value = true
  currentPage.value++
  await fetchAlbums(true)
}

async function fetchFilters() {
  try {
    const result = await window.api.albumFilters()
    if (result.success && result.data) {
      artists.value = result.data.artists
      genres.value = result.data.genres
    }
  } catch (error) {
    console.error('获取筛选选项失败:', error)
  }
}

// ==================== 重置列表（筛选/搜索/排序变化时） ====================

/**
 * 重置列表并重新获取数据。
 * @param scrollToAlbumId 若提供，则在加载完成后滚动到该专辑的行（用于取消筛选时保持位置）。
 */
function resetAndFetch(scrollToAlbumId?: number | null) {
  albums.value = []
  currentPage.value = 1
  hasMore.value = true

  if (!scrollToAlbumId) {
    // 没有目标专辑：重置滚动位置到顶部
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTop = 0
    }
    fetchAlbums()
  } else {
    // 有目标专辑：加载数据后尝试滚动到该专辑
    fetchAlbumsAndScrollTo(scrollToAlbumId)
  }
}

/**
 * 一次拉取完整结果集（fetchAll 模式）并滚动定位到目标专辑。
 * 替代逐页顺序加载循环：底部专辑定位从几十轮 IPC 降为一次。
 */
async function fetchAlbumsAndScrollTo(targetAlbumId: number) {
  loadingAll.value = true
  loadingMore.value = true
  try {
    const result = await window.api.albumList({ ...buildAlbumQueryOptions(), fetchAll: true })
    if (result.success && result.data) {
      applyFullResult(result.data)
    } else {
      showMessage('加载专辑列表失败', 'error')
    }
  } catch (error) {
    showMessage('加载专辑列表失败', 'error')
  } finally {
    loading.value = false
    loadingMore.value = false
    loadingAll.value = false
  }

  // 滚动到目标专辑
  await nextTick()
  scrollToAlbumRow(targetAlbumId)
}

/**
 * 滚动到指定专辑所在行。
 */
function scrollToAlbumRow(albumId: number) {
  if (!scrollContainerRef.value) return
  const idx = albums.value.findIndex(a => a.id === albumId)
  if (idx === -1) return

  // 两种视图的元素（表格行 / 网格卡片）DOM 顺序均与 albums 一致，按索引获取
  const items = scrollContainerRef.value.querySelectorAll<HTMLElement>('tr.album-row, .album-card')
  const target = items[idx]
  if (!target) return

  // 用 getBoundingClientRect 计算相对滚动容器的位置（网格卡片的 offsetTop 相对 offsetParent 不可靠）
  const container = scrollContainerRef.value
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTopInContent = targetRect.top - containerRect.top + container.scrollTop

  // 让目标行/卡片尽量居中显示
  container.scrollTop = Math.max(
    0,
    targetTopInContent - container.clientHeight / 2 + targetRect.height / 2
  )
}

// ==================== 搜索 ====================

let searchTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    // 清空到空串且存在选中专辑时保持选中并定位（与清除筛选行为一致）
    if (!searchQuery.value && selectedAlbumId.value) resetAndFetch(selectedAlbumId.value)
    else resetAndFetch()
  }, 300)
}

function clearSearch() {
  searchQuery.value = ''
  // 存在选中专辑时定位保持选中，否则回到列表顶部
  if (selectedAlbumId.value) resetAndFetch(selectedAlbumId.value)
  else resetAndFetch()
}

// ==================== 筛选 ====================

function applyFilters() {
  resetAndFetch()
}

// ==================== 风格标签编辑 ====================

const editingGenreAlbumId = ref<number | null>(null)
const editingGenres = ref<string[]>([])
const genreEditInput = ref('')
const showGenreEditSuggestions = ref(false)
const savingGenres = ref(false)

// 进入编辑态
function startEditGenres(album: Album) {
  editingGenreAlbumId.value = album.id
  editingGenres.value = [...(album.genres || [])]
  genreEditInput.value = ''
  showGenreEditSuggestions.value = false
}

// 取消编辑
function cancelEditGenres() {
  editingGenreAlbumId.value = null
  editingGenres.value = []
  genreEditInput.value = ''
  showGenreEditSuggestions.value = false
}

// 自动补全筛选（仅从已有风格库；以输入开头的优先）
function filteredGenreEditSuggestions(): string[] {
  const input = genreEditInput.value.toLowerCase().trim()
  if (!input) return []
  const candidates = genres.value
    .filter(g => !editingGenres.value.includes(g))
    .filter(g => g.toLowerCase().includes(input))
  // 以输入开头的排在前面，其余保持字母序
  candidates.sort((a, b) => {
    const aStarts = a.toLowerCase().startsWith(input) ? 0 : 1
    const bStarts = b.toLowerCase().startsWith(input) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return a.localeCompare(b)
  })
  return candidates
}

// 从建议列表选择风格
function selectGenreEditSuggestion(genre: string) {
  if (!editingGenres.value.includes(genre)) {
    editingGenres.value = [...editingGenres.value, genre].sort()
  }
  genreEditInput.value = ''
  showGenreEditSuggestions.value = false
}

// 删除风格标签
function removeEditGenre(genre: string) {
  editingGenres.value = editingGenres.value.filter(g => g !== genre)
}

// 编辑态输入框聚焦
// 处理风格编辑输入内容变化（确保选中建议后继续输入仍能弹出下拉框）
function onGenreEditInputChange() {
  showGenreEditSuggestions.value = true
}

function onGenreEditInputFocus() {
  showGenreEditSuggestions.value = true
}

// 编辑态输入框失焦
function onGenreEditInputBlur() {
  setTimeout(() => {
    showGenreEditSuggestions.value = false
  }, 200)
}

// 保存风格编辑
async function saveEditGenres() {
  if (editingGenreAlbumId.value === null) return
  savingGenres.value = true

  try {
    const result = await window.api.setAlbumGenres(editingGenreAlbumId.value, [...editingGenres.value])
    if (result.success) {
      // 更新本地数据
      const album = albums.value.find(a => a.id === editingGenreAlbumId.value)
      if (album) {
        album.genres = [...editingGenres.value]
      }
      // 刷新筛选选项（可能新增了风格关联）
      await fetchFilters()
      cancelEditGenres()
    } else {
      showMessage(`保存风格失败：${result.error}`, 'error')
    }
  } catch (error) {
    console.error('保存风格失败:', error)
    showMessage(`保存风格失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  } finally {
    savingGenres.value = false
  }
}

// ==================== 多风格筛选 ====================

// 切换风格选中状态
function toggleGenre(genre: string) {
  const index = selectedGenres.value.indexOf(genre)
  if (index === -1) {
    // 添加筛选
    selectedGenres.value = [...selectedGenres.value, genre]
    resetAndFetch()
  } else {
    // 移除筛选：若有展开的专辑，取消后定位到该专辑
    selectedGenres.value = selectedGenres.value.filter(g => g !== genre)
    resetAndFetch(selectedAlbumId.value)
  }
}

// 清除所有已选风格
function clearGenres() {
  const scrollTarget = selectedAlbumId.value
  selectedGenres.value = []
  resetAndFetch(scrollTarget)
}

// 判断风格是否已选中
function isGenreSelected(genre: string): boolean {
  return selectedGenres.value.includes(genre)
}

// 从风格统计弹窗中选择风格进行筛选
function handleSelectGenreFromStats(genre: string) {
  if (!selectedGenres.value.includes(genre)) {
    selectedGenres.value = [...selectedGenres.value, genre]
    resetAndFetch()
  }
}

// 过滤风格建议列表（排除已选、匹配输入；以输入开头的优先）
function filteredGenreSuggestions(): string[] {
  const input = genreInput.value.toLowerCase().trim()
  if (!input) return []
  const candidates = genres.value
    .filter(g => !selectedGenres.value.includes(g))
    .filter(g => g.toLowerCase().includes(input))
  // 以输入开头的排在前面，其余保持字母序
  candidates.sort((a, b) => {
    const aStarts = a.toLowerCase().startsWith(input) ? 0 : 1
    const bStarts = b.toLowerCase().startsWith(input) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return a.localeCompare(b)
  })
  return candidates
}

// 从建议列表选择风格
function selectGenreSuggestion(genre: string) {
  if (!selectedGenres.value.includes(genre)) {
    selectedGenres.value = [...selectedGenres.value, genre]
    currentPage.value = 1
    fetchAlbums()
  }
  genreInput.value = ''
  showGenreSuggestions.value = false
}

// 移除单个已选风格
function removeGenre(genre: string) {
  const scrollTarget = selectedAlbumId.value
  selectedGenres.value = selectedGenres.value.filter(g => g !== genre)
  if (scrollTarget) {
    albums.value = []
    currentPage.value = 1
    hasMore.value = true
    fetchAlbumsAndScrollTo(scrollTarget)
  } else {
    currentPage.value = 1
    fetchAlbums()
  }
}

// 处理风格输入内容变化（确保选中建议后继续输入仍能弹出下拉框）
function onGenreInputChange() {
  showGenreSuggestions.value = true
}

// 处理风格输入框聚焦
function onGenreInputFocus() {
  showGenreSuggestions.value = true
}

// 处理风格输入框失焦（延迟以允许点击建议）
function onGenreInputBlur() {
  setTimeout(() => {
    showGenreSuggestions.value = false
  }, 200)
}

// ==================== 艺术家筛选 ====================

// 过滤艺术家建议列表
function filteredArtistSuggestions(): string[] {
  const input = artistInput.value.toLowerCase().trim()
  if (!input) return []
  return artists.value
    .filter(a => a.toLowerCase().includes(input))
    .slice(0, 10)  // 最多显示 10 个
}

// 从建议列表选择艺术家
function selectArtistSuggestion(artist: string) {
  selectedArtist.value = artist
  artistInput.value = ''
  showArtistSuggestions.value = false
  currentPage.value = 1
  fetchAlbums()
}

// 清除已选艺术家
function clearArtist() {
  const scrollTarget = selectedAlbumId.value
  selectedArtist.value = ''
  artistInput.value = ''
  if (scrollTarget) {
    albums.value = []
    currentPage.value = 1
    hasMore.value = true
    fetchAlbumsAndScrollTo(scrollTarget)
  } else {
    currentPage.value = 1
    fetchAlbums()
  }
}

// 处理艺术家输入框聚焦
function onArtistInputFocus() {
  showArtistSuggestions.value = true
}

// 处理艺术家输入框失焦（延迟以允许点击建议）
function onArtistInputBlur() {
  setTimeout(() => {
    showArtistSuggestions.value = false
  }, 200)
}

// ==================== 随机选择 ====================

const randomPicking = ref(false)

async function handleRandomPick() {
  if (randomPicking.value) return
  randomPicking.value = true

  try {
    const result = await window.api.albumRandom()
    if (!result.success || !result.data) {
      showMessage(result.error || '没有可选的专辑', 'error')
      return
    }

    const randomAlbum = result.data

    // 优化：设置搜索词为专辑标题，利用搜索快速定位
    // 后端 LIKE 搜索会将结果集缩小到极少条目（通常第1页）
    searchQuery.value = randomAlbum.title
    selectedArtist.value = ''
    artistInput.value = ''
    selectedGenres.value = []
    genreInput.value = ''
    sortBy.value = undefined
    sortOrder.value = 'desc'

    // 重置列表并加载搜索结果（仅1页即可命中）
    albums.value = []
    currentPage.value = 1
    hasMore.value = true
    await fetchAlbums(false)

    // 滚动到随机专辑
    await nextTick()
    scrollToAlbumRow(randomAlbum.id)

    // 展开该专辑
    selectedAlbumId.value = randomAlbum.id

    showMessage(`🎲 随机选中：${randomAlbum.artist} - ${randomAlbum.title}`, 'info')
  } catch (error) {
    console.error('随机选择失败:', error)
    showMessage('随机选择失败', 'error')
  } finally {
    randomPicking.value = false
  }
}

// ==================== 排序 ====================

function toggleSort(field: 'mb_rating' | 'release_date' | 'user_rating') {
  if (sortBy.value === field) {
    // 点击同一列：切换排序方向
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    // 点击不同列：设置新排序，默认降序
    sortBy.value = field
    sortOrder.value = 'desc'
  }
  resetAndFetch()
}

function cancelSort(field: 'mb_rating' | 'release_date' | 'user_rating') {
  // 右键点击排序列头：如果当前正在按此列排序，则取消排序
  if (sortBy.value === field) {
    sortBy.value = undefined
    sortOrder.value = 'desc'
    resetAndFetch()
  }
}

// ==================== 视图切换 ====================

function toggleViewMode() {
  viewMode.value = viewMode.value === 'table' ? 'grid' : 'table'
  // 分页尺寸随视图变化，切换后重置列表重新加载；有选中专辑时定位保持选中
  resetAndFetch(selectedAlbumId.value)
}

// 唱片墙排序下拉框的值，与表格列头排序共享 sortBy/sortOrder
const gridSortKey = computed<string>({
  get: () => (sortBy.value ? `${sortBy.value}-${sortOrder.value}` : ''),
  set: (key: string) => {
    if (!key) {
      sortBy.value = undefined
      sortOrder.value = 'desc'
    } else {
      const [field, order] = key.split('-') as ['mb_rating' | 'release_date' | 'user_rating', 'asc' | 'desc']
      sortBy.value = field
      sortOrder.value = order
    }
    resetAndFetch()
  }
})

// 网格卡片角标：按当前排序字段显示对应信息（字段值为空则不显示角标）
function cardBadgeText(album: Album): string {
  if (sortBy.value === 'user_rating' && album.user_rating != null) {
    return `★ ${album.user_rating.toFixed(1)}`
  }
  if (sortBy.value === 'mb_rating' && album.mb_rating != null) {
    return `⭐ ${album.mb_rating.toFixed(1)}`
  }
  if (sortBy.value === 'release_date' && album.release_date) {
    return album.release_date
  }
  return ''
}

// ==================== 滚动进度条处理 ====================

async function handleScrollSeek(scrollTop: number) {
  const container = scrollContainerRef.value
  if (!container) return

  const maxScroll = container.scrollHeight - container.clientHeight
  // 拖到已加载内容的末尾且还有更多数据：一次拉全量并按相同比例继续定位，
  // 避免逐页加载导致需要反复拖动
  if (hasMore.value && !loadingAll.value && maxScroll > 0 && scrollTop >= maxScroll - 200) {
    const ratio = scrollTop / maxScroll
    loadingAll.value = true
    loadingMore.value = true
    try {
      const result = await window.api.albumList({ ...buildAlbumQueryOptions(), fetchAll: true })
      if (result.success && result.data) {
        applyFullResult(result.data)
      }
    } catch (error) {
      showMessage('加载专辑列表失败', 'error')
    } finally {
      loadingMore.value = false
      loadingAll.value = false
    }
    await nextTick()
    const newMax = container.scrollHeight - container.clientHeight
    container.scrollTop = Math.min(newMax, ratio * newMax)
    return
  }

  container.scrollTop = scrollTop
}

// ==================== 无限滚动 Observer ====================

function setupIntersectionObserver() {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
  }
  
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry && entry.isIntersecting && hasMore.value && !loadingMore.value && !loadingAll.value) {
        loadMore()
      }
    },
    {
      root: scrollContainerRef.value,
      rootMargin: '200px',
      threshold: 0
    }
  )
}

function observeSentinel() {
  if (intersectionObserver && sentinelRef.value) {
    intersectionObserver.observe(sentinelRef.value)
  }
}

// 监听哨兵元素变化
watch(sentinelRef, (newVal) => {
  if (newVal && intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver.observe(newVal)
  }
})

// 监听滚动容器变化，重新设置 observer
watch(scrollContainerRef, (newVal) => {
  if (newVal) {
    setupIntersectionObserver()
    if (sentinelRef.value) {
      intersectionObserver?.observe(sentinelRef.value)
    }
  }
})

// ==================== 以下为移除的分页代码 ====================
// goToPage 函数已移除，改为无限滚动

// ==================== 同步 ====================

async function handleSync() {
  syncing.value = true
  showMessage('正在同步专辑数据...', 'info')

  try {
    const result = await window.api.syncStart()
    if (result.success && result.data) {
      const { added, skipped, deleted, total } = result.data
      if (added > 0 || deleted > 0) {
        showMessage(`同步完成！新增 ${added} 张，删除 ${deleted} 张，跳过 ${skipped} 张已存在`, 'success')
      } else {
        showMessage(`同步完成，没有新增专辑（${total} 张均已存在）`, 'info')
      }
      // 刷新数据
      await fetchFilters()
      await fetchAlbums()

    } else {
      showMessage(`同步失败：${result.error}`, 'error')
    }
  } catch (error) {
    showMessage('同步失败：网络错误', 'error')
  } finally {
    syncing.value = false
  }
}

// 处理搜索添加专辑
async function handleSearchAlbumAdded() {
  showMessage('专辑已添加到收藏', 'success')
  // 刷新数据
  await fetchFilters()
  await fetchAlbums()
}

// ==================== 消息提示 ====================

function showMessage(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  message.value = msg
  messageType.value = type

  if (type !== 'error') {
    setTimeout(() => {
      if (message.value === msg) message.value = ''
    }, 5000)
  }
}

// ==================== 补全进度 ====================

let removeProgressListener: (() => void) | null = null

function setupProgressListener() {
  removeProgressListener = window.api.onEnrichProgress((progress) => {
    enrichProgress.value = {
      current: progress.current,
      total: progress.total,
      albumTitle: progress.albumTitle
    }

    // 补全完成
    if (progress.current >= progress.total) {
      setTimeout(async () => {
        enrichProgress.value = null
        await fetchAlbums()
        await fetchFilters()

        showMessage('数据补全完成！', 'success')
      }, 1000)
    }
  })
}

// ==================== 补全缺失MB数据的专辑 ====================

let removeMenuEnrichAlbumsWithoutMbDataListener: (() => void) | null = null

async function handleEnrichAlbumsWithoutMbData() {
  if (enrichProgress.value) {
    showMessage('补全正在进行中，请等待完成', 'info')
    return
  }

  showMessage('正在补全缺失MB数据的专辑...', 'info')

  try {
    const result = await window.api.enrichAlbumsWithoutMbData()
    if (!result.success) {
      showMessage(`补全失败：${result.error}`, 'error')
    }
    // 进度和完成提示由 onEnrichProgress 回调处理
  } catch (error) {
    showMessage('补全失败：未知错误', 'error')
  }
}

// ==================== 重新补全所有 ====================

let removeMenuReEnrichListener: (() => void) | null = null

async function handleReEnrichAll() {
  if (enrichProgress.value) {
    showMessage('补全正在进行中，请等待完成', 'info')
    return
  }

  showMessage('正在重新补全所有专辑的评分和风格信息...', 'info')

  try {
    const result = await window.api.enrichReEnrichAll()
    if (!result.success) {
      showMessage(`重新补全失败：${result.error}`, 'error')
    }
    // 进度和完成提示由 onEnrichProgress 回调处理
  } catch (error) {
    showMessage('重新补全失败：未知错误', 'error')
  }
}

// ==================== 批量补全缺失封面 ====================

let removeCoverFillProgressListener: (() => void) | null = null
let removeMenuCoverFillListener: (() => void) | null = null

async function handleCoverFill() {
  if (coverFillProgress.value) {
    showMessage('封面补全正在进行中，请等待完成', 'info')
    return
  }

  showMessage('正在补全缺失封面...', 'info')

  try {
    const result = await window.api.albumCoverFillStart()
    if (!result.success) {
      showMessage(`封面补全失败：${result.error}`, 'error')
      return
    }

    if (result.data) {
      const { total, filled, failed } = result.data
      if (result.loginRequired) {
        // 登录弹窗由后端触发，这里清理进度条并提示
        coverFillProgress.value = null
        showMessage('封面补全已中止：需要先登录网易云', 'error')
        return
      }
      if (total === 0) {
        showMessage('所有专辑均已有封面，无需补全', 'info')
      } else if (failed > 0) {
        showMessage(`封面补全完成！成功 ${filled} 张，失败 ${failed} 张（可重新运行补全）`, 'info')
      } else {
        showMessage(`封面补全完成！成功 ${filled} 张`, 'success')
      }
    }
    // 进度条清除与列表刷新由 onCoverFillProgress 回调处理
  } catch (error) {
    showMessage('封面补全失败：未知错误', 'error')
  }
}

function setupCoverFillProgressListener() {
  removeCoverFillProgressListener = window.api.onCoverFillProgress((progress) => {
    coverFillProgress.value = {
      current: progress.current,
      total: progress.total,
      albumTitle: progress.albumTitle,
      filled: progress.filled
    }

    // 补全完成
    if (progress.current >= progress.total) {
      setTimeout(async () => {
        coverFillProgress.value = null
        await fetchAlbums()
      }, 1000)
    }
  })
}

// ==================== 批量回填缺失发行日期 ====================

let removeReleaseDateFillProgressListener: (() => void) | null = null
let removeMenuReleaseDateFillListener: (() => void) | null = null

async function handleReleaseDateFill() {
  if (releaseDateFillProgress.value) {
    showMessage('发行日期回填正在进行中，请等待完成', 'info')
    return
  }

  showMessage('正在回填缺失发行日期...', 'info')

  try {
    const result = await window.api.albumReleaseDateFillStart()
    if (!result.success) {
      showMessage(`发行日期回填失败：${result.error}`, 'error')
      return
    }

    if (result.data) {
      const { total, filled, failed } = result.data
      if (result.loginRequired) {
        // 登录弹窗由后端触发，这里清理进度条并提示
        releaseDateFillProgress.value = null
        showMessage('发行日期回填已中止：需要先登录网易云', 'error')
        return
      }
      if (total === 0) {
        showMessage('所有专辑均已有发行日期，无需回填', 'info')
      } else if (failed > 0) {
        showMessage(`发行日期回填完成！成功 ${filled} 张，失败 ${failed} 张（可重新运行回填）`, 'info')
      } else {
        showMessage(`发行日期回填完成！成功 ${filled} 张`, 'success')
      }
    }
    // 进度条清除与列表刷新由 onReleaseDateFillProgress 回调处理
  } catch (error) {
    showMessage('发行日期回填失败：未知错误', 'error')
  }
}

function setupReleaseDateFillProgressListener() {
  removeReleaseDateFillProgressListener = window.api.onReleaseDateFillProgress((progress) => {
    releaseDateFillProgress.value = {
      current: progress.current,
      total: progress.total,
      albumTitle: progress.albumTitle,
      filled: progress.filled
    }

    // 回填完成
    if (progress.current >= progress.total) {
      setTimeout(async () => {
        releaseDateFillProgress.value = null
        await fetchAlbums()
      }, 1000)
    }
  })
}

// ==================== 登录相关 ====================

const showLoginModal = ref(false)
const showLoginGuide = ref(false)
let removeLoginRequiredListener: (() => void) | null = null
let removeMenuOpenLoginListener: (() => void) | null = null
let removeAuthStatusChangedListener: (() => void) | null = null

// 登录成功后的处理
function handleLoginSuccess() {
  showMessage('登录成功！可点击菜单栏「数据 → 同步专辑列表」同步收藏', 'success')
}

// 登录引导弹窗点击"登录"
function handleLoginGuideLogin() {
  showLoginGuide.value = false
  showLoginModal.value = true
}

// ==================== 生命周期 ====================

onMounted(async () => {
  setupProgressListener()
  setupCoverFillProgressListener()
  setupReleaseDateFillProgressListener()

  // Esc 关闭详情抽屉
  document.addEventListener('keydown', handleDetailKeydown)

  // 设置无限滚动的 IntersectionObserver
  setupIntersectionObserver()

  // 监听菜单栏"补全缺失MB数据的专辑"事件
  removeMenuEnrichAlbumsWithoutMbDataListener = window.api.onMenuEnrichAlbumsWithoutMbData(() => {
    handleEnrichAlbumsWithoutMbData()
  })

  // 监听菜单栏"重新补全所有专辑"事件
  removeMenuReEnrichListener = window.api.onMenuReEnrichAll(() => {
    handleReEnrichAll()
  })

  // 监听菜单栏"同步专辑列表"事件
  const removeMenuSyncListener = window.api.onMenuSyncAlbums(async () => {
    console.log('[App] 收到菜单同步事件')
    await handleSync()
  })

  // 监听菜单栏"补全缺失封面"事件
  removeMenuCoverFillListener = window.api.onMenuCoverFill(() => {
    handleCoverFill()
  })

  // 监听菜单栏"补全缺失发行日期"事件
  removeMenuReleaseDateFillListener = window.api.onMenuReleaseDateFill(() => {
    handleReleaseDateFill()
  })

  // 监听登录要求事件
  // 首次启动时显示引导弹窗，之后直接显示登录弹窗
  let isFirstLoginPrompt = true
  removeLoginRequiredListener = window.api.onLoginRequired(() => {
    if (isFirstLoginPrompt) {
      showLoginGuide.value = true
      isFirstLoginPrompt = false
    } else {
      // 非首次（如播放时触发）直接显示登录弹窗
      showLoginModal.value = true
    }
  })

  // 监听菜单栏"登录"按钮点击
  removeMenuOpenLoginListener = window.api.onMenuOpenLogin(() => {
    showLoginModal.value = true
  })

  // 监听登录状态变化
  removeAuthStatusChangedListener = window.api.onAuthStatusChanged((status) => {
    console.log('[App] 登录状态变化:', status.isLoggedIn ? status.user?.nickname : '未登录')
  })

  // 监听菜单栏"风格统计"事件
  removeMenuGenreStatsListener = window.api.onMenuGenreStats(() => {
    showGenreStatsModal.value = true
  })

  // 监听菜单栏"关于"事件
  removeMenuAboutListener = window.api.onMenuOpenAbout(() => {
    showAboutModal.value = true
  })

  // 监听菜单栏"导出数据"事件
  window.api.onMenuDbExport(async () => {
    const result = await window.api.dbExport()
    if (result.success && result.data) {
      alert(`导出成功！\n专辑: ${result.data.albums} 张\n曲目: ${result.data.tracks} 首\n保存至: ${result.data.path}`)
    } else if (result.error && result.error !== '已取消') {
      alert(`导出失败: ${result.error}`)
    }
  })

  // 监听菜单栏"导入数据"事件
  window.api.onMenuDbImport(async () => {
    const result = await window.api.dbImport()
    if (result.success && result.data) {
      alert(`导入成功！\n新增专辑: ${result.data.albumsAdded} 张\n更新专辑: ${result.data.albumsUpdated} 张\n曲目: ${result.data.tracksImported} 首\n风格: ${result.data.genresImported} 个`)
      await fetchAlbums()
      await fetchFilters()
    } else if (result.error && result.error !== '已取消') {
      alert(`导入失败: ${result.error}`)
    }
  })

  await fetchFilters()
  await fetchAlbums()
})

onUnmounted(() => {
  // 清理 Esc 监听
  document.removeEventListener('keydown', handleDetailKeydown)

  // 清理播放状态轮询与进度心跳
  stopPlayerPolling()
  stopProgressTicker()

  // 清理 IntersectionObserver
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
  
  if (removeProgressListener) {
    removeProgressListener()
  }
  if (removeCoverFillProgressListener) {
    removeCoverFillProgressListener()
  }
  if (removeMenuCoverFillListener) {
    removeMenuCoverFillListener()
  }
  if (removeMenuEnrichAlbumsWithoutMbDataListener) {
    removeMenuEnrichAlbumsWithoutMbDataListener()
  }
  if (removeMenuReEnrichListener) {
    removeMenuReEnrichListener()
  }
  if (removeLoginRequiredListener) {
    removeLoginRequiredListener()
  }
  if (removeMenuOpenLoginListener) {
    removeMenuOpenLoginListener()
  }
  if (removeAuthStatusChangedListener) {
    removeAuthStatusChangedListener()
  }
  if (removeMenuGenreStatsListener) {
    removeMenuGenreStatsListener()
  }
  if (removeMenuAboutListener) {
    removeMenuAboutListener()
  }
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<style>
/* ==================== Reset & Base ==================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary: #5b6abf;
  --primary-hover: #4a59a8;
  --bg: #f8f9fb;
  --surface: #ffffff;
  --border: #e2e6ea;
  --text: #2c3e50;
  --text-secondary: #6c757d;
  --success: #28a745;
  --error: #dc3545;
  --info: #17a2b8;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  --panel-width: clamp(360px, 40vw, 620px);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ==================== Toolbar ==================== */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow);
  z-index: 10;
  -webkit-app-region: drag;
}

.toolbar-left {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--primary);
  user-select: none;
}

.search-online-btn {
  padding: 6px 12px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
}

.search-online-btn:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.random-pick-btn {
  padding: 6px 12px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 4px;
}

.random-pick-btn:hover:not(:disabled) {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.random-pick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.view-toggle-btn {
  padding: 6px 10px;
  min-width: 32px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-toggle-btn:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.toolbar-center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.toolbar-right {
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* ==================== Search ==================== */
.search-box {
  position: relative;
  flex: 1;
  max-width: 360px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 7px 30px 7px 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--bg);
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(91, 106, 191, 0.1);
}

.search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 50%;
}

.search-clear:hover {
  background: var(--border);
}

/* ==================== Filter Select ==================== */
.filter-select {
  padding: 7px 28px 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  outline: none;
  background: var(--bg);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236c757d' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 120px;
}

.filter-select:focus {
  border-color: var(--primary);
}

/* ==================== Buttons ==================== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  background: var(--surface);
  color: var(--text);
  transition: all 0.15s;
  user-select: none;
}

.btn:hover:not(:disabled) {
  background: var(--bg);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

.btn-lg {
  padding: 10px 24px;
  font-size: 15px;
}

/* ==================== Spinner ==================== */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.6s linear infinite;
}

.spinner.large {
  width: 32px;
  height: 32px;
  border-color: rgba(91, 106, 191, 0.2);
  border-top-color: var(--primary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==================== Enrich Progress Bar ==================== */
.enrich-bar {
  background: #eef2ff;
  border-bottom: 1px solid #c7d2fe;
  padding: 8px 20px;
}

.enrich-bar-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.enrich-text {
  font-size: 12px;
  color: var(--primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.enrich-progress-track {
  flex: 1;
  height: 4px;
  background: #c7d2fe;
  border-radius: 2px;
  overflow: hidden;
}

.enrich-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s;
}

/* ==================== Message Bar ==================== */
.message-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  font-size: 13px;
  animation: slideDown 0.2s ease;
}

.message-bar.success {
  background: #d4edda;
  color: #155724;
  border-bottom: 1px solid #c3e6cb;
}

.message-bar.error {
  background: #f8d7da;
  color: #721c24;
  border-bottom: 1px solid #f5c6cb;
}

.message-bar.info {
  background: #d1ecf1;
  color: #0c5460;
  border-bottom: 1px solid #bee5eb;
}

.message-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: inherit;
  opacity: 0.6;
  padding: 0 4px;
}

.message-close:hover {
  opacity: 1;
}

@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ==================== Table Wrapper (无限滚动布局) ==================== */
.table-wrapper {
  flex: 1;
  display: flex;
  gap: 4px;
  padding: 0;
  min-height: 0; /* 允许 flex 子元素收缩 */
}

.table-scroll-container,
.grid-scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* 隐藏原生滚动条 */
.table-scroll-container::-webkit-scrollbar,
.grid-scroll-container::-webkit-scrollbar {
  display: none;
}

.table-scroll-container,
.grid-scroll-container {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

/* 旧的 table-container 样式保留以防万一 */
.table-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.album-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.album-table thead {
  position: sticky;
  top: 0;
  z-index: 5;
}

.album-table th {
  background: #f0f2f5;
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.album-table th.sortable {
  cursor: pointer;
  transition: color 0.15s;
}

.album-table th.sortable:hover {
  color: var(--primary);
}

.sort-arrow {
  font-size: 10px;
  margin-left: 2px;
  color: var(--primary);
}

.album-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f2f5;
  font-size: 13px;
  vertical-align: middle;
}

.album-table tbody tr.album-row {
  cursor: pointer;
  transition: background 0.1s;
  /* 离屏行跳过渲染；若出现行高异常（Chromium 对 tr 的 content-visibility 有已知怪癖）则移除本规则 */
  content-visibility: auto;
  contain-intrinsic-size: auto 43px;
}

.album-table tbody tr.album-row:hover {
  background: #f8f9ff;
}

.album-table tbody tr.album-row.row-selected {
  background: #eef2ff;
}

/* ==================== Grid View (唱片墙) ==================== */
.grid-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.grid-toolbar-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.grid-sort-select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.album-grid {
  display: grid;
  /* minmax(120px,1fr)+auto-fill：窗口变宽时卡片与列数同时增长、始终铺满；
     auto-fill 保留空轨道参与 1fr 分配，1-2 张结果时卡片不被拉大（隐含上限不超过约 2×120px，列数越多越接近 120px） */
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0px;
  padding: 1px 1px;
}

.album-card {
  position: relative;
  aspect-ratio: 1 / 1;
  /* 无圆角：唱片墙保持方正，封面由 overflow:hidden 裁切 */
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow);
  transition: transform 0.15s, box-shadow 0.15s;
  /* 离屏卡片跳过渲染：全量列表时只绘制视口附近卡片（auto 记忆真实尺寸避免滚动抖动） */
  content-visibility: auto;
  contain-intrinsic-size: auto 160px;
}

/* 卡片内封面/占位符自身清零圆角与阴影，否则内侧圆角会露出页面底色 */
.album-card .cover-img {
  border-radius: 0;
  box-shadow: none;
}

.album-card .cover-placeholder {
  border-radius: 0;
}

.album-card:hover {
  transform: scale(1.02);
}

.album-card.card-selected {
  /* 选中卡片像从唱片墙上抽出：轻微放大 + 强阴影，浮于相邻卡片之上（z-index 保证绘制层级） */
  transform: scale(1.06);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 1;
}

.card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  text-align: center;
}

.album-card:hover .card-overlay {
  opacity: 1;
}

.card-title {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-artist {
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 排序角标：显示当前排序字段的值，置于遮罩之上保持可见 */
.card-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 2;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  border-radius: 4px;
  /* 右侧预留右下角播放按钮空间（28px 按钮 + 6px 边距 + 10px 间隙），避免长文本与按钮重叠 */
  max-width: calc(100% - 44px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 实体介质角标（左上角，常驻显示，与左下排序角标/右下播放按钮互不重叠） */
.card-media-badges {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  display: flex;
  gap: 4px;
}

.card-media-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.card-media-badge svg {
  width: 15px;
  height: 15px;
}

.grid-sentinel {
  grid-column: 1 / -1;
}

/* ==================== Detail Panel (常驻详情面板) ==================== */
.detail-panel {
  flex-shrink: 0;
  width: var(--panel-width);
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.panel-header-info {
  min-width: 0;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-title-placeholder {
  color: var(--text-secondary);
}

.panel-artist {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 隐藏面板滚动条 */
.panel-body::-webkit-scrollbar {
  display: none;
}

.panel-body {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-secondary);
  font-size: 13px;
}

.panel-empty-icon {
  font-size: 2.5rem;
  opacity: 0.5;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px;
  background: var(--surface);
}

/* Hero 两栏：封面居左放大，信息居右 */
.detail-hero {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
}

.detail-cover {
  flex-shrink: 0;
  width: clamp(140px, 42%, 240px);
  aspect-ratio: 1 / 1;
}

.cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8ecf4;
  border-radius: var(--radius);
  font-size: 3rem;
  color: #a0aec0;
}

.detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.detail-section {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-right: 4px;
  line-height: 22px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.meta-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.detail-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--primary);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.detail-link:hover {
  background: #eef2ff;
  border-color: var(--primary);
}

/* ==================== Play Button ==================== */
.album-title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
}

.btn-play:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-play-album {
  width: 28px;
  height: 28px;
  font-size: 11px;
  background: var(--primary);
  color: white;
}

.btn-play-album:hover:not(:disabled) {
  background: #4338ca;
  transform: scale(1.1);
}

/* 唱片墙卡片右下角悬停播放按钮：随卡片悬停淡入，播放中保持可见（spinner） */
.btn-play-card {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.15s;
  width: 28px;
  height: 28px;
  font-size: 11px;
  background: var(--primary);
  color: white;
}

.album-card:hover .btn-play-card {
  opacity: 1;
}

.btn-play-card:hover:not(:disabled) {
  background: #4338ca;
  transform: scale(1.1);
}

.btn-play-card:disabled {
  opacity: 1;
}

.btn-play-track {
  width: 22px;
  height: 22px;
  font-size: 9px;
  background: transparent;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.track-row:hover .btn-play-track {
  opacity: 1;
}

.btn-play-track:hover:not(:disabled) {
  background: var(--primary);
  color: white;
}

.btn-play-track:disabled {
  opacity: 1;
}

.btn-play .spinner.small {
  width: 10px;
  height: 10px;
  border-width: 2px;
}

/* ==================== Tracklist ==================== */
.detail-tracklist {
  width: 100%;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.tracklist-header {
  margin-bottom: 8px;
}

.tracklist-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.tracklist-empty {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 12px 0;
}

.disc-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  padding: 6px 0 4px;
  border-bottom: 1px solid #eef2ff;
  margin-bottom: 2px;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  border-bottom: 1px solid #f5f6f8;
  transition: background 0.1s;
}

.track-row:last-child {
  border-bottom: none;
}

.track-row:hover {
  background: #f0f2f8;
}

.track-num {
  width: 32px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
  flex-shrink: 0;
}

.track-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text);
}

.track-artist {
  flex: 0 1 auto;
  max-width: 280px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: right;
}

.track-duration {
  flex: 0 0 48px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* ==================== Comments ==================== */
.detail-comments {
  width: 100%;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.comments-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.comments-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.comments-count {
  text-transform: none;
  font-weight: 400;
}

.comments-refresh-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.1s;
}

.comments-refresh-btn:hover:not(:disabled) {
  color: var(--primary);
}

.comments-refresh-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.comments-empty {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 12px 0;
}

.comment-row {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f6f8;
}

.comment-row:last-child {
  border-bottom: none;
}

.comment-avatar {
  flex-shrink: 0;
}

.comment-avatar img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.comment-main {
  flex: 1;
  min-width: 0;
}

.comment-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.comment-nickname {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.comment-time {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.comment-content {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 2px;
}

.comment-like {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.btn-retry {
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
  color: var(--primary);
}

.btn-retry:hover:not(:disabled) {
  background: #eef2ff;
}

.btn-retry:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Column widths */
.col-index { width: 44px; text-align: center; color: var(--text-secondary); }
.col-title { width: 24%; }
.col-artist { width: 16%; }
.col-user-rating { width: 120px; text-align: center; }
.col-media { width: 80px; text-align: center; }
.col-mb-rating { width: 80px; text-align: center; }
.col-genre { width: 22%; }
.col-date { width: 100px; }

.media-chips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.media-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--primary);
}

.media-chip svg {
  width: 14px;
  height: 14px;
}

.album-title {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================== Rating ==================== */
.rating-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: #d97706;
}

.rating-na {
  color: #ccc;
}

/* ==================== Genre Tags ==================== */
.genre-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.genre-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #eef2ff;
  color: var(--primary);
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
}

.genre-more {
  display: inline-block;
  padding: 2px 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

/* 可点击的风格标签 */
.genre-tag.clickable {
  cursor: pointer;
  transition: all 0.15s ease;
}

.genre-tag.clickable:hover {
  background: #dbeafe;
  transform: scale(1.05);
}

/* 已选中的风格标签 */
.genre-tag.selected {
  background: var(--primary);
  color: white;
}

.genre-tag.selected:hover {
  background: #4f46e5;
}

/* ==================== 风格标签编辑 ==================== */
.genre-edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  opacity: 0.6;
  transition: opacity 0.15s;
  vertical-align: middle;
}

.genre-edit-btn:hover {
  opacity: 1;
}

.genre-edit-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.genre-edit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.genre-edit-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #eef2ff;
  color: var(--primary);
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
}

.genre-edit-tag-remove {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  opacity: 0.6;
  line-height: 1;
}

.genre-edit-tag-remove:hover {
  opacity: 1;
  color: var(--error);
}

.genre-edit-input-container {
  position: relative;
}

.genre-edit-input {
  width: 100%;
  max-width: 200px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: white;
  transition: border-color 0.2s;
}

.genre-edit-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.genre-edit-input::placeholder {
  color: #aaa;
}

.genre-edit-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  max-width: 200px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 180px;
  overflow-y: auto;
  margin-top: 2px;
}

.genre-edit-suggestion-item {
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.genre-edit-suggestion-item:hover {
  background: #eef2ff;
}

.genre-edit-actions {
  display: flex;
  gap: 6px;
}

.genre-edit-save {
  padding: 3px 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.genre-edit-save:hover:not(:disabled) {
  background: var(--primary-hover);
}

.genre-edit-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.genre-edit-cancel {
  padding: 3px 12px;
  background: none;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.genre-edit-cancel:hover:not(:disabled) {
  background: #f3f4f6;
}

.genre-edit-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ==================== 艺术家筛选组件 ==================== */
.artist-filter-container {
  position: relative;
}

.artist-filter-input-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.artist-filter-input {
  width: 140px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: white;
  transition: border-color 0.2s;
}

.artist-filter-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.artist-filter-input::placeholder {
  color: #aaa;
}

.artist-filter-input:disabled {
  width: 0;
  padding: 0;
  border: none;
  opacity: 0;
}

.selected-artist-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px 5px 10px;
  background: #10b981;
  color: white;
  border-radius: 6px;
  font-size: 13px;
  white-space: nowrap;
}

.selected-artist-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: rgba(255, 255, 255, 0.3);
  color: white;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.selected-artist-remove:hover {
  background: rgba(255, 255, 255, 0.5);
}

.artist-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  margin-top: 4px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
}

.artist-suggestion-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.artist-suggestion-item:hover {
  background: #f3f4f6;
}

.artist-suggestion-item:first-child {
  border-radius: 6px 6px 0 0;
}

.artist-suggestion-item:last-child {
  border-radius: 0 0 6px 6px;
}

/* ==================== 多风格筛选组件 ==================== */
.genre-filter-container {
  position: relative;
}

.genre-filter-input {
  width: 160px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: white;
  transition: border-color 0.2s;
}

.genre-filter-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.genre-filter-input::placeholder {
  color: #aaa;
}

.genre-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
}

.genre-suggestion-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.genre-suggestion-item:hover {
  background: #f3f4f6;
}

.genre-suggestion-item:first-child {
  border-radius: 6px 6px 0 0;
}

.genre-suggestion-item:last-child {
  border-radius: 0 0 6px 6px;
}

/* ==================== 已选风格标签区域 ==================== */
.selected-genres-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  background: #fefce8;
  border-bottom: 1px solid #fde68a;
}

.selected-genres-label {
  font-size: 13px;
  color: #92400e;
  font-weight: 500;
  flex-shrink: 0;
}

.selected-genres-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.selected-genre-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 10px;
  background: var(--primary);
  color: white;
  border-radius: 14px;
  font-size: 12px;
}

.selected-genre-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: rgba(255, 255, 255, 0.3);
  color: white;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.selected-genre-remove:hover {
  background: rgba(255, 255, 255, 0.5);
}

.clear-genres-btn {
  padding: 4px 10px;
  border: 1px solid #fbbf24;
  background: transparent;
  color: #92400e;
  border-radius: 14px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-genres-btn:hover {
  background: #fde68a;
}

/* ==================== Empty State ==================== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 4rem;
  opacity: 0.3;
}

.empty-state h2 {
  font-size: 1.3rem;
  color: var(--text);
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 8px;
}

/* ==================== Loading State ==================== */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
}

/* ==================== 无限滚动 - 哨兵和加载更多 ==================== */
.sentinel-row {
  background: none !important;
}

.sentinel-row:hover {
  background: none !important;
}

.load-more-sentinel {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.load-more-spinner {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

/* ==================== Pagination (已弃用，保留样式以防万一) ==================== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 10px 20px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.page-info {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ==================== Scrollbar ==================== */
.table-container::-webkit-scrollbar {
  width: 6px;
}

.table-container::-webkit-scrollbar-track {
  background: transparent;
}

.table-container::-webkit-scrollbar-thumb {
  background: #d0d5dd;
  border-radius: 3px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #b0b5bd;
}

/* ==================== User Rating (list row - readonly) ==================== */
.user-rating-display {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.user-stars-readonly {
  font-size: 12px;
  color: #f59e0b;
  letter-spacing: -1px;
  line-height: 1;
}

.user-rating-num {
  font-size: 12px;
  font-weight: 600;
  color: #d97706;
}

/* ==================== Star Rating (detail - interactive) ==================== */
.star-rating {
  display: inline-flex;
  align-items: center;
  gap: 0;
  user-select: none;
}

.star-half {
  display: inline-block;
  font-size: 20px;
  color: #d0d5dd;
  cursor: pointer;
  transition: color 0.1s;
  line-height: 1;
  overflow: hidden;
  width: 0.5em;
}

.star-left {
  text-align: left;
}

.star-right {
  text-align: right;
  direction: rtl;
}

.star-half.filled {
  color: #f59e0b;
}

.star-half:hover {
  transform: scale(1.15);
}

.star-rating-value {
  margin-left: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #d97706;
}

/* ==================== 实体介质标记 ==================== */
.detail-section-media {
  align-items: center;
}

.media-segment {
  display: flex;
  gap: 6px;
}

.media-segment-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.media-segment-btn svg {
  width: 15px;
  height: 15px;
  flex: none;
}

.media-segment-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.media-segment-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.media-segment-btn.active:hover {
  background: var(--primary-hover);
  color: #fff;
}

</style>

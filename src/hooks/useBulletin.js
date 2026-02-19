import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import {
  getBulletins, postBulletin, removeBulletin,
  startThread, sendMessage as apiSendMessage,
  getThreads, getThreadMessages, closeThread as apiCloseThread,
  getComments, postComment, removeComment as apiRemoveComment,
} from '../lib/api'

const useBulletin = create((set, get) => ({
  posts: [],
  threads: [],
  activeThread: null,   // thread_id currently viewing
  messages: [],         // messages for activeThread
  comments: {},         // { bulletinId: [...comments] }
  loading: false,
  modalOpen: false,

  setModalOpen: (open) => set({ modalOpen: open }),

  /** Fetch all bulletins + user's threads */
  refresh: async () => {
    set({ loading: true })
    try {
      const dh = await getDeviceHash()
      const [bulletinsRes, threadsRes] = await Promise.all([
        getBulletins(dh),
        getThreads(dh),
      ])
      set({
        posts: Array.isArray(bulletinsRes.data) ? bulletinsRes.data : [],
        threads: Array.isArray(threadsRes.data) ? threadsRes.data : [],
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  /** Post a new bulletin */
  post: async (section, text, anonymous = false) => {
    try {
      const dh = await getDeviceHash()
      const res = await postBulletin(dh, section, text, anonymous)
      if (res.data?.success) {
        await get().refresh()
        return true
      }
      return false
    } catch {
      return false
    }
  },

  /** Remove own bulletin */
  remove: async (bulletinId) => {
    try {
      const dh = await getDeviceHash()
      await removeBulletin(dh, bulletinId)
      set(s => ({ posts: s.posts.filter(p => p.id !== bulletinId) }))
    } catch { /* silent */ }
  },

  /** Load comments for a bulletin */
  loadComments: async (bulletinId) => {
    try {
      const dh = await getDeviceHash()
      const res = await getComments(bulletinId, dh)
      const list = Array.isArray(res.data) ? res.data : []
      set(s => ({ comments: { ...s.comments, [bulletinId]: list } }))
    } catch { /* silent */ }
  },

  /** Post a comment on a bulletin */
  addComment: async (bulletinId, text, anonymous = false) => {
    try {
      const dh = await getDeviceHash()
      const res = await postComment(dh, bulletinId, text, anonymous)
      if (res.data?.success) {
        // Re-fetch comments for that bulletin
        await get().loadComments(bulletinId)
        // Bump the comment_count in local posts
        set(s => ({
          posts: s.posts.map(p =>
            p.id === bulletinId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
          ),
        }))
        return true
      }
      return false
    } catch {
      return false
    }
  },

  /** Remove own comment */
  removeComment: async (bulletinId, commentId) => {
    try {
      const dh = await getDeviceHash()
      await apiRemoveComment(dh, commentId)
      // Remove locally
      set(s => ({
        comments: {
          ...s.comments,
          [bulletinId]: (s.comments[bulletinId] || []).filter(c => c.id !== commentId),
        },
        posts: s.posts.map(p =>
          p.id === bulletinId ? { ...p, comment_count: Math.max(0, (p.comment_count || 1) - 1) } : p
        ),
      }))
    } catch { /* silent */ }
  },

  /** Start a thread on a bulletin and open it */
  startThread: async (bulletinId) => {
    try {
      const dh = await getDeviceHash()
      const res = await startThread(dh, bulletinId)
      const threadId = res.data?.thread_id
      if (threadId) {
        await get().refresh()
        await get().openThread(threadId)
        return threadId
      }
    } catch { /* silent */ }
    return null
  },

  /** Open a thread and load its messages */
  openThread: async (threadId) => {
    set({ activeThread: threadId, messages: [] })
    try {
      const dh = await getDeviceHash()
      const res = await getThreadMessages(threadId, dh)
      set({ messages: res.data?.messages || [] })
    } catch { /* silent */ }
  },

  /** Send a message in the active thread */
  sendMessage: async (text) => {
    const { activeThread } = get()
    if (!activeThread) return
    try {
      const dh = await getDeviceHash()
      await apiSendMessage(dh, activeThread, text)
      const res = await getThreadMessages(activeThread, dh)
      set({ messages: res.data?.messages || [] })
    } catch { /* silent */ }
  },

  /** Close a thread (permanently deletes messages) */
  closeThread: async (threadId) => {
    try {
      const dh = await getDeviceHash()
      await apiCloseThread(dh, threadId)
      set(s => ({
        threads: s.threads.filter(t => t.id !== threadId),
        activeThread: s.activeThread === threadId ? null : s.activeThread,
        messages: s.activeThread === threadId ? [] : s.messages,
      }))
    } catch { /* silent */ }
  },
}))

export default useBulletin

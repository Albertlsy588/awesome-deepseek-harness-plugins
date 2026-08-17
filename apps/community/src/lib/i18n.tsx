import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Language = 'en' | 'zh'

/** The same key the main site uses, so a reader's choice survives the hop. */
const STORAGE_KEY = 'dsh-language'

const messages = {
  zh: {
    siteName: '1024 广场',
    tagline: 'DeepSeek Harness 开发者的公开广场',
    latest: '最新',
    hot: '热门',
    signIn: '用 GitHub 登录',
    signOut: '退出',
    composerPlaceholder: '聊点什么？支持 Markdown，写 @owner/name 会自动带出插件卡片',
    replyPlaceholder: '写条评论…',
    publish: '发布',
    publishing: '发布中…',
    reply: '评论',
    replies: '条评论',
    like: '赞',
    liked: '已赞',
    share: '复制链接',
    shared: '已复制',
    remove: '删除',
    removeConfirm: '删除这条内容？删掉之后别人还能看到讨论串，但正文会消失。',
    deletedBody: '这条内容已被删除。',
    signInToPost: '登录后即可发言。你的身份就是 GitHub 账号，不需要另外注册。',
    signInToReact: '登录后才能点赞和评论。',
    emptyFeed: '还没有人发言。第一条由你来写。',
    emptyAuthor: '这里还什么都没有。',
    loadMore: '加载更多',
    loading: '加载中…',
    loadError: '没能加载内容。',
    retry: '重试',
    backToFeed: '返回广场',
    notFound: '这条内容不存在，或者已经被删除了。',
    stats: '社区数据',
    statPosts: '帖子',
    statAuthors: '发言者',
    statToday: '今日新帖',
    charactersLeft: '还可以输入 {n} 字',
    tooLong: '超出 {n} 字',
    guidelines: '社区规则',
    aboutTitle: '关于 1024 广场',
    unofficialNotice: '独立社区项目，与 DeepSeek 官方无关。',
    backToStore: '回到插件目录',
    justNow: '刚刚',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    daysAgo: '{n} 天前',
    postsBy: '的发言',
    mentionedPlugin: '提到的插件',
    devSignIn: '本地开发登录',
  },
  en: {
    siteName: '1024 Plaza',
    tagline: 'The open square for DeepSeek Harness developers',
    latest: 'Latest',
    hot: 'Hot',
    signIn: 'Sign in with GitHub',
    signOut: 'Sign out',
    composerPlaceholder: 'What are you working on? Markdown works, and @owner/name pulls in a plugin card',
    replyPlaceholder: 'Write a comment…',
    publish: 'Post',
    publishing: 'Posting…',
    reply: 'Comment',
    replies: 'comments',
    like: 'Like',
    liked: 'Liked',
    share: 'Copy link',
    shared: 'Copied',
    remove: 'Delete',
    removeConfirm: 'Delete this? The thread stays readable, but the text goes away.',
    deletedBody: 'This has been deleted.',
    signInToPost: 'Sign in to post. Your GitHub account is your identity — nothing else to register.',
    signInToReact: 'Sign in to like and comment.',
    emptyFeed: 'Nobody has posted yet. Go first.',
    emptyAuthor: 'Nothing here yet.',
    loadMore: 'Load more',
    loading: 'Loading…',
    loadError: 'Could not load anything.',
    retry: 'Try again',
    backToFeed: 'Back to the feed',
    notFound: 'That post does not exist, or it was deleted.',
    stats: 'Community',
    statPosts: 'Posts',
    statAuthors: 'Voices',
    statToday: 'Today',
    charactersLeft: '{n} characters left',
    tooLong: '{n} over the limit',
    guidelines: 'Guidelines',
    aboutTitle: 'About 1024 Plaza',
    unofficialNotice: 'Independent community project. Not affiliated with DeepSeek.',
    backToStore: 'Back to the plugin catalog',
    justNow: 'just now',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
    postsBy: '’s posts',
    mentionedPlugin: 'Mentioned',
    devSignIn: 'Local dev sign-in',
  },
} as const

export type MessageKey = keyof (typeof messages)['zh']

interface I18nValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'zh'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'zh') return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  }, [])

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => {
      const template: string = messages[language][key]
      if (!values) return template
      return Object.entries(values).reduce(
        (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
        template,
      )
    },
  }), [language, setLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n used outside I18nProvider')
  return value
}

/** Relative time, coarse on purpose: an exact minute is noise in a feed. */
export function useRelativeTime(): (iso: string) => string {
  const { t, language } = useI18n()
  return useCallback((iso: string) => {
    const elapsed = Date.now() - Date.parse(iso)
    const minutes = Math.floor(elapsed / 60_000)
    if (minutes < 1) return t('justNow')
    if (minutes < 60) return t('minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('daysAgo', { n: days })
    return new Date(iso).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [language, t])
}

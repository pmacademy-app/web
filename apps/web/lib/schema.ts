import { BRAND } from './brand'
import { FAQ_ITEMS } from '@/config/content'
import {
  COURSE_WORKLOAD_HOURS,
  MODULE_META_LIST,
  formatModuleHours,
  getModuleTitle,
} from '@/lib/curriculum/module-meta'
import type { CompiledLesson } from '@/types'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl

/**
 * 1. EducationalOrganization Schema
 */
export function getEducationalOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${siteUrl}/#organization`,
    name: BRAND.fullName,
    url: siteUrl,
    logo: `${siteUrl}${BRAND.assets.logoFullSvg}`,
    image: `${siteUrl}${BRAND.assets.ogImage}`,
    description: BRAND.metadata.description,
    founder: {
      '@type': 'Person',
      '@id': `${siteUrl}/#person-aditya`,
      name: 'Aditya Gangwani',
      url: 'https://adityagangwani.me',
      jobTitle: 'Founder & Creator',
    },
    sameAs: [
      BRAND.social.linkedin,
      BRAND.social.twitter,
      BRAND.social.instagram,
      BRAND.social.buyMeACoffee,
      'https://adityagangwani.me',
    ],
  }
}

/**
 * 2. WebSite Schema
 */
export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: BRAND.fullName,
    url: siteUrl,
    description: BRAND.metadata.shortDescription,
    publisher: {
      '@id': `${siteUrl}/#organization`,
    },
  }
}

/**
 * 3. Course Schema for /curriculum
 */
export function getCourseSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    '@id': `${siteUrl}/curriculum#course`,
    name: `${BRAND.fullName}: Full Product Management Curriculum`,
    description: BRAND.metadata.description,
    url: `${siteUrl}/curriculum`,
    provider: {
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: BRAND.fullName,
      url: siteUrl,
    },
    isAccessibleForFree: true,
    inLanguage: 'en',
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      // Reading plus quizzes and reflections, summed from the compiled lessons.
      courseWorkload: `PT${COURSE_WORKLOAD_HOURS}H`,
    },
    hasPart: MODULE_META_LIST.map((mod) => ({
      '@type': 'CourseUnit',
      name: `Module ${mod.number}: ${mod.title}`,
      description: `${mod.description} Outcome: ${mod.outcome}. ${mod.lessonCount} lessons, about ${formatModuleHours(mod.estimatedMinutes)}.`,
      position: mod.number,
    })),
  }
}

/**
 * 4. LearningResource / Article Schema for /lessons/[slug]
 */
export function getLessonSchema(
  lesson: CompiledLesson,
  globalOrder: number,
  slug: string
) {
  const lessonUrl = `${siteUrl}/lessons/${slug}`
  const moduleName = getModuleTitle(lesson.module)

  const levelStr =
    lesson.difficulty === 1
      ? 'Beginner'
      : lesson.difficulty === 2
      ? 'Intermediate'
      : 'Advanced'

  return {
    '@context': 'https://schema.org',
    '@type': ['LearningResource', 'Article'],
    '@id': `${lessonUrl}#learningresource`,
    name: `Lesson ${globalOrder}: ${lesson.title}`,
    headline: `Lesson ${globalOrder}: ${lesson.title}`,
    description: `Read Lesson ${globalOrder} of ${BRAND.product}. ${lesson.title} (Module: ${moduleName}).`,
    learningResourceType: 'Lesson',
    educationalLevel: levelStr,
    timeRequired: `PT${lesson.estimatedReadingTime || 20}M`,
    url: lessonUrl,
    mainEntityOfPage: lessonUrl,
    author: {
      '@type': 'Person',
      '@id': `${siteUrl}/#person-aditya`,
      name: 'Aditya Gangwani',
      url: 'https://adityagangwani.me',
    },
    publisher: {
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: BRAND.fullName,
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}${BRAND.assets.logoFullSvg}`,
      },
    },
    isPartOf: {
      '@type': 'Course',
      '@id': `${siteUrl}/curriculum#course`,
      name: `${BRAND.fullName} Curriculum`,
      url: `${siteUrl}/curriculum`,
    },
  }
}

/**
 * 5. BreadcrumbList Schema
 */
export interface BreadcrumbItem {
  name: string
  url: string
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/**
 * 6. AboutPage & Person Schema for /about
 */
export function getAboutPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${siteUrl}/about#webpage`,
        url: `${siteUrl}/about`,
        name: `About: ${BRAND.fullName}`,
        description:
          "Learn why Prodily exists and how we're making structured product management education more accessible.",
        mainEntity: {
          '@id': `${siteUrl}/#person-aditya`,
        },
      },
      {
        '@type': 'Person',
        '@id': `${siteUrl}/#person-aditya`,
        name: 'Aditya Gangwani',
        url: 'https://adityagangwani.me',
        jobTitle: 'Founder & Creator',
        worksFor: {
          '@type': 'EducationalOrganization',
          '@id': `${siteUrl}/#organization`,
          name: BRAND.fullName,
          url: siteUrl,
        },
        sameAs: [
          BRAND.social.buyMeACoffee,
          'https://adityagangwani.me',
        ],
      },
    ],
  }
}

/**
 * 7. FAQPage Schema
 *
 * Defaults to the full FAQ_ITEMS list (used by /faq). The optional items argument lets
 * a page mark up only the questions it renders.
 */
export function getFAQPageSchema(
  items: ReadonlyArray<{ question: string; answer: string }> = FAQ_ITEMS
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

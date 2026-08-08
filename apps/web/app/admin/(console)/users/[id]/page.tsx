import { redirect } from 'next/navigation'

interface Context {
  params: Promise<{ id: string }>
}

export default async function LegacyAdminUserDetailPage({ params }: Context) {
  const { id } = await params
  redirect(`/admin/users?userId=${id}`)
}

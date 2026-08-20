'use client'

import React, { useState, useRef } from 'react'
import Image from 'next/image'
import { Camera, Loader2, Upload, User } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

interface AvatarUploadProps {
  userId: string
  currentAvatarUrl?: string | null
  onUploadSuccess?: (url: string) => void
}

export function AvatarUpload({ userId, currentAvatarUrl, onUploadSuccess }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl || null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return
    }

    const file = e.target.files[0]
    // Validate file type & size
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be under 2MB.')
      return
    }

    setIsUploading(true)
    setError(null)
    const supabase = createBrowserSupabaseClient()

    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`

      // Upload to 'avatars' bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      setAvatarUrl(publicUrl)
      if (onUploadSuccess) {
        onUploadSuccess(publicUrl)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An error occurred during upload.')
      }
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative group w-24 h-24 rounded-full border-2 border-brand-border bg-brand-surface overflow-hidden flex items-center justify-center">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" width={96} height={96} unoptimized />
        ) : (
          <User className="w-10 h-10 text-brand-fg-subtle" />
        )}

        {/* Hover overlay for upload */}
        <label
          htmlFor="avatar-upload"
          className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer transition-opacity text-white"
        >
          {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
        </label>
        <input
          id="avatar-upload"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>

      <div className="text-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" /> {avatarUrl ? 'Change Avatar' : 'Upload Avatar'}
            </>
          )}
        </Button>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>
    </div>
  )
}

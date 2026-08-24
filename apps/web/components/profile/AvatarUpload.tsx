'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Camera, Loader2, Upload, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AvatarUploadProps {
  userId?: string
  currentAvatarUrl?: string | null
  onUploadSuccess?: (url: string) => void
  onRemove?: () => void
}

export function AvatarUpload({ currentAvatarUrl, onUploadSuccess, onRemove }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl || null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarUrl(currentAvatarUrl || null)
  }, [currentAvatarUrl])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return
    }

    const file = e.target.files[0]
    // Validate file type & size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError('Please select a valid image file (PNG, JPG, WebP).')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image file size must be under 2MB.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'An error occurred during avatar upload.')
      }

      setAvatarUrl(data.avatarUrl)
      if (onUploadSuccess) {
        onUploadSuccess(data.avatarUrl)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An error occurred during upload. Please try again.')
      }
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveAvatar = async () => {
    setIsUploading(true)
    setError(null)

    try {
      const res = await fetch('/api/user/avatar', {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove avatar.')
      }

      setAvatarUrl(null)
      if (onRemove) {
        onRemove()
      }
      if (onUploadSuccess) {
        onUploadSuccess('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative group w-20 h-20 rounded-full border-2 border-border bg-card overflow-hidden flex items-center justify-center shadow-xs">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" width={80} height={80} unoptimized />
        ) : (
          <User className="w-8 h-8 text-muted-foreground/60" />
        )}

        {/* Hover overlay for upload */}
        <label
          htmlFor="avatar-upload-input"
          className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer transition-opacity text-white"
          title="Upload new image"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
        </label>
        <input
          id="avatar-upload-input"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>

      <div className="space-y-1.5 text-center sm:text-left">
        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-semibold"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> {avatarUrl ? 'Change Image' : 'Upload Image'}
              </>
            )}
          </Button>

          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              onClick={handleRemoveAvatar}
              className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          PNG, JPG, or WebP up to 2MB. Square image recommended.
        </p>
        {error && <p className="text-xs text-destructive font-medium">{error}</p>}
      </div>
    </div>
  )
}

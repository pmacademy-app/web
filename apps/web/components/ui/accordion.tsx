'use client'

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

const AccordionContext = React.createContext<{
  value?: string | string[]
  onValueChange?: (val: string) => void
  type?: 'single' | 'multiple'
}>({})

export function Accordion({
  className,
  children,
  type = 'single',
  defaultValue,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  type?: 'single' | 'multiple'
  defaultValue?: string | string[]
}) {
  const [value, setValue] = React.useState<string | string[]>(
    defaultValue || (type === 'multiple' ? [] : '')
  )

  const onValueChange = React.useCallback(
    (itemVal: string) => {
      if (type === 'multiple') {
        setValue((prev) => {
          const arr = Array.isArray(prev) ? prev : []
          return arr.includes(itemVal) ? arr.filter((v) => v !== itemVal) : [...arr, itemVal]
        })
      } else {
        setValue((prev) => (prev === itemVal ? '' : itemVal))
      }
    },
    [type]
  )

  return (
    <AccordionContext.Provider value={{ value, onValueChange, type }}>
      <div data-slot="accordion" className={cn("flex w-full flex-col", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

const AccordionItemContext = React.createContext<{ value: string }>({ value: '' })

export function AccordionItem({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div
        data-slot="accordion-item"
        className={cn("border-b border-border/60", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { value, onValueChange } = React.useContext(AccordionContext)
  const { value: itemValue } = React.useContext(AccordionItemContext)
  const isOpen = Array.isArray(value) ? value.includes(itemValue) : value === itemValue

  return (
    <div className="flex">
      <button
        type="button"
        data-slot="accordion-trigger"
        aria-expanded={isOpen}
        onClick={() => onValueChange?.(itemValue)}
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg py-3 text-left text-sm font-medium transition-all outline-none hover:underline",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
    </div>
  )
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { value } = React.useContext(AccordionContext)
  const { value: itemValue } = React.useContext(AccordionItemContext)
  const isOpen = Array.isArray(value) ? value.includes(itemValue) : value === itemValue

  if (!isOpen) return null

  return (
    <div
      data-slot="accordion-content"
      className={cn("overflow-hidden text-sm pb-3 text-muted-foreground", className)}
      {...props}
    >
      {children}
    </div>
  )
}

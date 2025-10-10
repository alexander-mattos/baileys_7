declare module 'link-preview-js' {
  export function getLinkPreview(url: string, options?: any): Promise<any>
}

// allow importing modules without types in this repo during dev
declare module '*'

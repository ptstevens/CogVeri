# Cloudflare R2 CORS Configuration

To allow video playback from your Cloudflare R2 bucket in the browser, you need to configure CORS (Cross-Origin Resource Sharing) settings.

## Configuration Steps

1. **Go to Cloudflare Dashboard**
   - Navigate to R2
   - Select your bucket: `cogveri-recordings`

2. **Click on "Settings" tab**

3. **Scroll to "CORS Policy" section**

4. **Add the following CORS policy:**

```json
[
  {
    "AllowedOrigins": [
      "https://cogveri.app",
      "https://www.cogveri.app",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Explanation

- **AllowedOrigins**: Your frontend domains (production and development)
- **AllowedMethods**: GET and HEAD are needed for video streaming
- **AllowedHeaders**: Allow all headers (can be restricted if needed)
- **ExposeHeaders**: Headers that browsers can access
- **MaxAgeSeconds**: How long browsers can cache the CORS preflight response

## Testing

After applying this configuration:

1. Wait a few minutes for the changes to propagate
2. Try playing a video in the review section
3. Check browser console for any CORS errors
4. If you see CORS errors, verify:
   - The frontend URL is in AllowedOrigins
   - The CORS policy was saved correctly
   - You're not using a different subdomain

## Additional Notes

- The `crossOrigin="anonymous"` attribute in the video tag requires this CORS configuration
- Without proper CORS, videos will fail to load with "Network error" or "CORS policy" errors
- You can remove localhost origins from production if desired

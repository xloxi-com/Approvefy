# Customer Registration Form - Theme Extension

This theme app extension adds a custom registration form with manual approval workflow to your Shopify store.

## Features

- **App Embed Block**: Enable/disable the custom registration system from the theme editor
- **Custom Form Fields**: Additional fields for company name, phone number, etc.
- **Pending Approval Messages**: Automatic notifications to customers after registration
- **Seamless Integration**: Works with existing Shopify customer registration

## Installation

The extension is automatically included with the B2B Customer Validation app.

## How to Enable

1. **Install the App**: Make sure the B2B Customer Validation app is installed on your store
2. **Go to Theme Editor**: 
   - Navigate to **Online Store > Themes**
   - Click **Customize** on your active theme
3. **Enable App Embed**:
   - Click on **App embeds** in the left sidebar (bottom section)
   - Find **"Approvefy"**
   - Toggle it **ON**
4. **Configure Settings**:
   - **Enable Custom Registration Form**: Toggle to enable/disable
   - **Show Pending Approval Message**: Display message after registration
   - **Pending Approval Message**: Customize the message text
5. **Save** your changes

## Usage

Once enabled:
- New customers registering will see additional custom fields
- After registration, they'll see a pending approval message
- Admin can approve/deny customers from the app dashboard
- Approved customers can log in normally

## Files Structure

```
extensions/registration-form/
├── shopify.extension.toml          # Extension configuration
├── blocks/
│   └── app-embed.liquid             # App embed block with settings
├── snippets/
│   └── custom-registration-fields.liquid  # Form fields template
└── assets/
    ├── custom-registration.js       # JavaScript handler
    └── custom-registration.css      # Styles
```

## Customization

You can customize the form fields and styling by editing the files in the extension directory.

## Support

For issues or questions, contact the app developer.

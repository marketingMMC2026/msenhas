# Hostinger Horizons Project - SecureVault

A secure, enterprise-grade secret management application built with React, Supabase, and TailwindCSS. This application allows users to store, share, and manage sensitive credentials with robust access controls and audit logging.

## 🚀 Features

- **Secure Secret Storage**: Encrypted storage for sensitive credentials.
- **Access Control**: Granular permissions (View, Edit, Manage Access) for users and groups.
- **Audit Logging**: Comprehensive tracking of all actions (Create, Read, Update, Delete, Share).
- **Authentication**: Secure login via Google Workspace (OAuth) or Email/Password.
- **Domain Restriction**: Restricts access to specific email domains for enterprise security.
- **Responsive Design**: Built with TailwindCSS and shadcn/ui for a modern, mobile-friendly interface.

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite
- **Styling**: TailwindCSS, shadcn/ui (Radix UI)
- **State Management**: React Hooks
- **Routing**: React Router DOM v6
- **Backend & Database**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Icons**: Lucide React

## 📋 Prerequisites

- Node.js v20+
- npm v9+
- A Supabase project

## ⚙️ Environment Variables

Create a `.env` file in the root directory for development. For production, use environment variables provided by your hosting platform.

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase Anon (Public) Key | `eyJhbGciOiJIUzI1NiIsInR...` |
| `VITE_ALLOWED_DOMAIN` | Restrict login to this email domain | `example.com` |
| `VITE_SECRET_ENCRYPTION_KEY` | Client-side encryption passphrase for new secrets. Use a long random value and keep it stable. | `use-a-long-random-value-here` |

> Existing plaintext secrets remain readable. New or edited secrets are encrypted when `VITE_SECRET_ENCRYPTION_KEY` is configured.

> **Note**: You can find your Supabase URL and Anon Key in the Supabase Dashboard under `Project Settings > API`.

## 💻 Development Setup

1. **Clone the repository**

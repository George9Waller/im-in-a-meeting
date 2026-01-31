# I'm in a Meeting!

A Chrome extension that automatically changes your Philips Hue light color when you join a Google Meet call, giving others a visual indicator that you're busy.

**Built for remote workers who need a simple way to signal "do not disturb" to family, roommates, and coworkers.**

<!--
📸 SCREENSHOT PLACEHOLDER: Hero Banner
- Side-by-side comparison showing:
  - Left: Popup showing "I'm available!" with green indicator
  - Right: Popup showing "I'm in a meeting!" with red indicator
- Optionally include a photo of an actual Hue light in both states
- Dimensions: 1280x640 recommended for social previews
-->

## Features

- **Automatic Detection** — Detects when you join or leave a Google Meet call
- **Warning State** — Optional different color when you have Meet open but haven't joined yet
- **Smart Restoration** — Automatically restores your light to its previous state when you leave
- **Tab-Aware** — Warning state only activates when the Meet tab is focused
- **Customizable Colors** — Choose any color for meeting and warning states using HSB sliders
- **Persistent** — State survives even if Chrome restarts the background worker during long meetings
- **Language Support** - Currently supports English & French

## How It Works

1. **Available** — Your light stays in its normal state
2. **Warning** (optional) — When you open a Meet tab, the light changes to warn others you might be joining soon
3. **In Meeting** — When you join a call, the light changes to your meeting color
4. **Restored** — When you leave or close the tab, your light returns to its original state

<!--
📸 SCREENSHOT PLACEHOLDER: Demo GIF
- Animated GIF (15-30 seconds) showing the full flow:
  1. Start with popup showing "Available"
  2. Open a Google Meet link
  3. Popup changes to "Warning" state
  4. Click "Join now" in Meet
  5. Popup changes to "In Meeting" state
  6. Leave the meeting
  7. Popup returns to "Available"
- Include a small inset or split-screen of a Hue light changing colors
- Dimensions: 800x600 or similar
-->

## Installation

### From Chrome Web Store

<!-- TODO: Add Chrome Web Store badge and link once published -->

*Coming soon!*

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `src/` directory

## Setup

### 1. Connect to Your Hue Bridge

<!--
📸 SCREENSHOT PLACEHOLDER: Bridge Discovery
- Settings page showing "1. Connect to Hue Bridge" section
- Show the IP address field with a discovered IP (e.g., "192.168.1.xxx")
- Include the Rediscover and Authenticate buttons
- Dimensions: 600x300
-->

Open the extension settings by clicking the gear icon in the popup. The extension will automatically discover your Hue bridge. If discovery fails, you can enter the IP address manually.

### 2. Authenticate

<!--
📸 SCREENSHOT PLACEHOLDER: Authentication
- Settings page showing the info message "Press the button on your bridge now..."
- Optionally: photo of finger pressing the Hue bridge button
- Dimensions: 600x200
-->

Press the physical button on your Hue bridge, then click **Authenticate**. This creates a secure connection between the extension and your bridge.

### 3. Select Your Light

<!--
📸 SCREENSHOT PLACEHOLDER: Light Selection
- Settings page showing "2. Select Light" section
- Grid of light cards with names like "Desk Lamp", "Office Light"
- One light highlighted as selected (green border)
- Dimensions: 600x300
-->

Choose which light you want to use as your meeting indicator from the grid of available lights.

### 4. Configure Colors

<!--
📸 SCREENSHOT PLACEHOLDER: Color Configuration
- Settings page showing "3. Meeting Light Settings" section
- Color preview square showing red
- HSB sliders (Hue, Saturation, Brightness)
- Test and Save buttons
- Dimensions: 600x350
-->

Set your preferred meeting color using the Hue, Saturation, and Brightness sliders. Use the **Test** button to preview the color on your light.

Optionally enable a **Warning color** for when you have Meet open but haven't joined a call yet.

## Usage

Once configured, the extension works automatically in the background.

| Your Status | Popup Shows | Light Color | When |
|-------------|-------------|-------------|------|
| Available | "I'm available!" | Original/unchanged | No Meet tab focused |
| Warning | "I'm about to be in a meeting!" | Warning color | Meet tab focused, not in call |
| In Meeting | "I'm in a meeting!" | Meeting color | Active Google Meet call |

<!--
📸 SCREENSHOT PLACEHOLDER: Status States
- Three popup screenshots arranged horizontally:
  1. "Available" state - green dot and text
  2. "Warning" state - yellow/orange dot and text
  3. "In Meeting" state - red dot and text
- Each popup ~280px wide
- Total dimensions: 900x200
-->

## Requirements

- Google Chrome (or Chromium-based browser)
- Philips Hue Bridge (v2 recommended)
- At least one color-capable Philips Hue light
- Bridge and computer on the same local network

## Privacy

This extension:

- **Only activates** on `meet.google.com` pages
- **Only communicates** with your local Hue bridge and Philips' discovery service (`discovery.meethue.com`)
- **Stores all data locally** in your browser (bridge IP, credentials, color preferences)
- **Does not collect** any personal data, analytics, or telemetry
- **Does not access** meeting content, participants, or metadata

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| `meet.google.com` | Detect when you're on a Google Meet page and in a call |
| `storage` | Save bridge configuration and color preferences locally |
| `tabs` | Open the settings page when you click the gear icon |
| `http://*/*` | Communicate with your Hue bridge on your local network |

> **Note:** The broad `http://*/*` permission is required because Hue bridges use HTTP (not HTTPS) and can have any local IP address. This permission is only used for Hue API calls.

## Troubleshooting

### Bridge not discovered
- Ensure your Hue bridge is powered on and connected
- Verify your computer is on the same network as the bridge
- Try entering the bridge IP manually (find it in the Philips Hue app: Settings → Hue Bridges → ⓘ)

### Authentication fails
- Make sure you press the bridge button within 30 seconds of clicking Authenticate
- Check that no firewall is blocking local network connections

### Light doesn't change color
- Verify the light is powered on and reachable in the Hue app
- Use the **Test** button in settings to check the connection
- Ensure the light supports color (white-only bulbs won't work)

### Status stuck on Warning
- The warning state requires the Meet tab to be focused/active
- Try clicking on the Meet tab to bring it into focus

### Light doesn't restore after meeting
- This can happen if the extension was installed mid-meeting
- The light state is saved when you first enter Warning or Meeting status

## Development

For architecture details, code structure, and contribution guidelines, see [CLAUDE.md](CLAUDE.md).

```
src/
├── _locales/          # i18n translations
├── lib/               # Shared modules (Hue API, storage, i18n)
├── popup/             # Extension popup UI
├── scripts/           # Content scripts (Meet detection)
├── settings/          # Full settings page
├── background.js      # Service worker
└── manifest.json
```

## Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or code contributions, all input helps make this extension better.

**Found a bug or have a feature idea?**
- [Open an issue](../../issues/new) describing the problem or suggestion
- Include steps to reproduce for bugs, or use cases for feature requests

**Want to contribute code?**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (see [CLAUDE.md](CLAUDE.md) for architecture details)
4. Test thoroughly with the extension loaded in developer mode
5. Submit a pull request

**Other ways to help:**
- Add translations — copy `src/_locales/en/messages.json` to a new locale folder
- Improve documentation
- Share the extension with others who work from home

## License

MIT License — see [LICENSE](LICENSE) for details.

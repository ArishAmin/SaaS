const fs = require('fs');
const files = [
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/components/help/HelpHeroActions.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/components/layout/Footer.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/components/help/HelpChatbot.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/components/layout/DashboardShell.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/app/privacy/page.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/app/terms/page.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/app/pricing/page.tsx',
  'c:/Users/amina/OneDrive/Documents/Personal/SaaS/DataPilotAI/web/src/app/dashboard/company/page.tsx'
];

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const newContent = content.replace(/\/dashboard\/contact/g, '/contact');
    if (content !== newContent) {
      fs.writeFileSync(file, newContent);
      console.log(`Updated ${file}`);
    }
  } catch (err) {
    console.error(`Error reading ${file}: ${err.message}`);
  }
}

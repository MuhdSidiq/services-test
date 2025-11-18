// Load environment variables FIRST before any other imports
import { config } from 'dotenv';
config({ path: '.env.local' });

import app from './app';

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`🚀 Gantify Services running on port ${port}`);
  console.log(`📱 WhatsApp API: http://localhost:${port}/api/whatsapp`);
  console.log(`🏥 Health check: http://localhost:${port}/`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});



import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string) {
  results.push({ name, status, message });
}

console.log('🔍 Production Readiness Check\n');
console.log('=' .repeat(60));

// 1. Check if dist directory exists
if (fs.existsSync('dist')) {
  check('Build Directory', 'PASS', 'dist/ directory exists');
} else {
  check('Build Directory', 'FAIL', 'dist/ directory not found');
}

// 2. Check if compiled files exist
const requiredFiles = [
  'dist/server.js',
  'dist/app.js',
  'dist/routes/auth.routes.js',
  'dist/routes/whatsapp.routes.js',
  'dist/middleware/auth.middleware.js',
  'dist/lib/prisma.js'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    check(`File: ${file}`, 'PASS', 'File exists');
  } else {
    check(`File: ${file}`, 'FAIL', 'File missing');
  }
});

// 3. Check environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WA_ACCESS_TOKEN',
  'WA_PHONE_NUMBER_ID',
  'WA_BUSINESS_ACCOUNT_ID',
  'PORT'
];

const envFile = '.env';
if (fs.existsSync(envFile)) {
  check('Environment File', 'PASS', '.env file exists');

  const envContent = fs.readFileSync(envFile, 'utf-8');
  requiredEnvVars.forEach(envVar => {
    if (envContent.includes(`${envVar}=`)) {
      check(`Env Var: ${envVar}`, 'PASS', 'Defined in .env');
    } else {
      check(`Env Var: ${envVar}`, 'WARNING', 'Not found in .env - may be set elsewhere');
    }
  });
} else {
  check('Environment File', 'WARNING', '.env file not found - ensure env vars are set');
}

// 4. Check package.json scripts
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
if (packageJson.scripts?.start) {
  check('Start Script', 'PASS', `"start": "${packageJson.scripts.start}"`);
} else {
  check('Start Script', 'FAIL', 'No start script defined');
}

if (packageJson.scripts?.build) {
  check('Build Script', 'PASS', `"build": "${packageJson.scripts.build}"`);
} else {
  check('Build Script', 'FAIL', 'No build script defined');
}

// 5. Check for production dependencies
const prodDeps = [
  'express',
  'bcrypt',
  'jsonwebtoken',
  '@aws-sdk/client-sesv2',
  'axios'
];

prodDeps.forEach(dep => {
  if (packageJson.dependencies?.[dep]) {
    check(`Dependency: ${dep}`, 'PASS', `Version ${packageJson.dependencies[dep]}`);
  } else {
    check(`Dependency: ${dep}`, 'WARNING', 'Not found in dependencies');
  }
});

// 6. Check Prisma setup
if (fs.existsSync('prisma/schema.prisma')) {
  check('Prisma Schema', 'PASS', 'schema.prisma exists');
} else {
  check('Prisma Schema', 'FAIL', 'schema.prisma not found');
}

if (fs.existsSync('app/generated/prisma')) {
  check('Prisma Client', 'PASS', 'Generated Prisma client exists');
} else {
  check('Prisma Client', 'WARNING', 'Prisma client may need to be generated');
}

// 7. Check tsconfig.json
if (fs.existsSync('tsconfig.json')) {
  const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf-8'));
  check('TypeScript Config', 'PASS', 'tsconfig.json exists');

  if (tsconfig.compilerOptions?.outDir === 'dist') {
    check('TS Output Directory', 'PASS', 'outDir is set to "dist"');
  } else {
    check('TS Output Directory', 'WARNING', `outDir is "${tsconfig.compilerOptions?.outDir}"`);
  }
} else {
  check('TypeScript Config', 'FAIL', 'tsconfig.json not found');
}

// 8. Check for security issues
if (fs.existsSync('.env')) {
  const gitignoreContent = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf-8') : '';
  if (gitignoreContent.includes('.env')) {
    check('Security: .env in .gitignore', 'PASS', '.env is properly ignored');
  } else {
    check('Security: .env in .gitignore', 'FAIL', '.env should be in .gitignore');
  }
}

// 9. Check node_modules
if (fs.existsSync('node_modules')) {
  check('Dependencies Installed', 'PASS', 'node_modules exists');
} else {
  check('Dependencies Installed', 'FAIL', 'Run npm install');
}

// 10. Check Docker (optional)
if (fs.existsSync('Dockerfile')) {
  check('Docker Support', 'PASS', 'Dockerfile exists');
} else {
  check('Docker Support', 'WARNING', 'No Dockerfile found (optional)');
}

if (fs.existsSync('.dockerignore')) {
  check('Docker Ignore', 'PASS', '.dockerignore exists');
} else {
  check('Docker Ignore', 'WARNING', 'No .dockerignore found (optional)');
}

// Print results
console.log('\n');
let passCount = 0;
let failCount = 0;
let warningCount = 0;

results.forEach(result => {
  const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${result.name.padEnd(40)} ${result.message}`);

  if (result.status === 'PASS') passCount++;
  if (result.status === 'FAIL') failCount++;
  if (result.status === 'WARNING') warningCount++;
});

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Summary: ${passCount} passed, ${failCount} failed, ${warningCount} warnings\n`);

if (failCount > 0) {
  console.log('❌ NOT READY FOR PRODUCTION - Fix critical issues above\n');
  process.exit(1);
} else if (warningCount > 0) {
  console.log('⚠️  READY WITH WARNINGS - Review warnings before deploying\n');
  process.exit(0);
} else {
  console.log('✅ READY FOR PRODUCTION\n');
  process.exit(0);
}

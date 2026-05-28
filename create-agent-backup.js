const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const projectRoot = 'e:\\vivpr\\ai\\xpider-trial';
const zipPath = path.join(projectRoot, 'XPIDER_Agent_Complete_Backup.zip');

console.log('=== [백업 생성] XPIDER 에이전트 인계용 백업 패키징 시작 ===');
console.log(`- 프로젝트 경로: ${projectRoot}`);
console.log(`- 결과 백업 파일: ${zipPath}\n`);

// 1. 기존 백업 파일이 있으면 삭제
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
  console.log('🗑️ 기존 백업 파일을 안전하게 제거했습니다.');
}

const zip = new AdmZip();

// 2. 포함할 핵심 단일 파일들 (루트)
const includeFiles = [
  'package.json',
  'package-lock.json',
  'forge.config.js',
  'SUPABASE_SETUP.sql',
  'TOS.md',
  '.env',
  '.gitignore'
];

// 3. 포함할 핵심 폴더들
const includeDirs = [
  'src',
  'extensions',
  'assets'
];

// 4. 루트 파일 추가
includeFiles.forEach(file => {
  const filePath = path.join(projectRoot, file);
  if (fs.existsSync(filePath)) {
    zip.addLocalFile(filePath, '');
    console.log(`✅ 파일 추가: ${file}`);
  } else {
    console.log(`⚠️ 파일 누락 (건너뜀): ${file}`);
  }
});

// 5. 폴더들 재귀 추가
includeDirs.forEach(dir => {
  const dirPath = path.join(projectRoot, dir);
  if (fs.existsSync(dirPath)) {
    // addLocalFolder(localPath, zipPath)
    // zipPath를 폴더명으로 지정해야 zip 압축 내부에 폴더가 생성됨
    zip.addLocalFolder(dirPath, dir);
    console.log(`✅ 폴더 추가: ${dir}/`);
  } else {
    console.log(`⚠️ 폴더 누락 (건너뜀): ${dir}`);
  }
});

// 6. 현재 AI 에이전트의 작업 태스크 정보와 가이드도 함께 포함시킵니다!
const taskPath = 'C:\\Users\\vivPR\\.gemini\\antigravity\\brain\\442f16c0-e5fb-442d-961e-38f247113b0a\\task.md';
const walkthroughPath = 'C:\\Users\\vivPR\\.gemini\\antigravity\\brain\\442f16c0-e5fb-442d-961e-38f247113b0a\\walkthrough.md';

if (fs.existsSync(taskPath)) {
  zip.addLocalFile(taskPath, '');
  console.log('✅ 파일 추가: task.md (현재 작업 태스크 현황)');
}
if (fs.existsSync(walkthroughPath)) {
  zip.addLocalFile(walkthroughPath, '');
  console.log('✅ 파일 추가: walkthrough.md (상세 개발 가이드)');
}

// 7. 압축 파일 디스크 기록
console.log('\n📦 백업 아카이브 압축 진행 중... (약 10~30초 소요)');
try {
  zip.writeZip(zipPath);
  
  // 8. 용량 확인
  const stats = fs.statSync(zipPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log('\n==================================================');
  console.log('🎉 [백업 완료] 에이전트 인계용 백업 패키지가 완성되었습니다!');
  console.log(`- 파일명: XPIDER_Agent_Complete_Backup.zip`);
  console.log(`- 용량: ${sizeMB} MB`);
  console.log(`- 경로: ${zipPath}`);
  console.log('==================================================');
  process.exit(0);
} catch (err) {
  console.error('\n❌ 에러: 백업 압축 파일 기록 중 예외가 발생했습니다.');
  console.error(err.message);
  process.exit(1);
}

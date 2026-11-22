// توقيع ذاتي (ad-hoc) لتطبيق الماك حتى يعمل على أجهزة Apple Silicon بدون شهادة مدفوعة
const { execSync } = require('child_process');
const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  console.log('  • ad-hoc signing ' + app);
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep --strict --verbose=2 "${app}"`, { stdio: 'inherit' });
};

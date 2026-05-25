// Ad-hoc code-sign the packaged macOS app. Apple Silicon (arm64) refuses to run
// an unsigned app; an ad-hoc signature ("-") is enough for local use without an
// Apple Developer certificate.
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`  • ad-hoc signing ${appPath}`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
}

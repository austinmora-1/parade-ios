Pod::Spec.new do |s|
  s.name           = 'AppGroupSession'
  s.version        = '1.0.0'
  s.summary        = 'Bridges the signed-in Parade identity into the shared App Group so the iMessage extension can read it (Phase B).'
  s.description    = 'Writes/reads a small identity payload (userId, shareCode, displayName) to UserDefaults(suiteName: group.app.parade.ios). No auth tokens are stored — see modules/app-group-session/index.ts.'
  s.author         = 'Parade'
  s.homepage       = 'https://helloparade.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end

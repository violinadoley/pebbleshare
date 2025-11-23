export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-stone-50">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-20 overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-amber-100/30 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-100/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-stone-100/40 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-6xl w-full">
          {/* Navigation */}
          <nav className="mb-20">
            <div className="glass-card px-6 py-4 flex items-center justify-between">
              <div className="text-xl font-semibold tracking-tight">PebbleShare</div>
              <div className="flex gap-4">
                <button className="px-4 py-2 text-sm font-medium hover:opacity-70 transition-opacity">
                  Features
                </button>
                <button className="px-4 py-2 text-sm font-medium hover:opacity-70 transition-opacity">
                  How it works
                </button>
                <button className="px-6 py-2 text-sm font-medium bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors">
                  Get Started
                </button>
              </div>
            </div>
          </nav>

          {/* Hero Content */}
          <div className="text-center mb-16">
            <h1 className="text-6xl md:text-7xl font-light tracking-tight mb-6 text-stone-900">
              Decentralized data storage,
              <br />
              <span className="font-normal">reimagined</span>
            </h1>
            <p className="text-xl text-stone-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              Store and share your data securely on the blockchain. 
              Powered by Seal and Walrus, with flexible paywall options via x402.
            </p>
            <div className="flex gap-4 justify-center">
              <button className="px-8 py-4 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-colors shadow-lg">
                Start Sharing
              </button>
              <button className="px-8 py-4 glass-card font-medium hover:opacity-80 transition-opacity">
                Learn More
              </button>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 mt-20">
            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 mb-6 flex items-center justify-center">
                <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-stone-900">Secure Storage</h3>
              <p className="text-stone-600 leading-relaxed">
                Your data is encrypted and stored across a decentralized network, ensuring maximum security and availability.
              </p>
            </div>

            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 mb-6 flex items-center justify-center">
                <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-stone-900">Easy Sharing</h3>
              <p className="text-stone-600 leading-relaxed">
                Share files and data with anyone, anywhere. Control access with granular permissions and paywall options.
              </p>
            </div>

            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 mb-6 flex items-center justify-center">
                <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-stone-900">Flexible Paywalls</h3>
              <p className="text-stone-600 leading-relaxed">
                Monetize your content with x402 paywall integration. Set your own pricing and get paid directly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="glass-card p-12 md:p-16">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-light mb-4 text-stone-900">Powered by cutting-edge technology</h2>
              <p className="text-stone-600 text-lg">Built on Seal and Walrus for reliable, decentralized storage</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-2xl font-semibold text-stone-900">Seal Protocol</h3>
                <p className="text-stone-600 leading-relaxed">
                  Leveraging the Seal protocol for secure, verifiable data storage on the blockchain. 
                  Your data integrity is guaranteed through cryptographic proofs.
                </p>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-2xl font-semibold text-stone-900">Walrus Network</h3>
                <p className="text-stone-600 leading-relaxed">
                  Built on the Walrus network for efficient, cost-effective data storage and retrieval. 
                  Experience fast access to your files from anywhere in the world.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-12 md:p-16">
            <h2 className="text-4xl font-light mb-6 text-stone-900">Ready to get started?</h2>
            <p className="text-xl text-stone-600 mb-10 max-w-2xl mx-auto">
              Join the decentralized data revolution. Store, share, and monetize your content with ease.
            </p>
            <button className="px-10 py-5 bg-stone-900 text-white rounded-full font-medium text-lg hover:bg-stone-800 transition-colors shadow-lg">
              Create Your Account
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 px-6 border-t border-stone-200/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-stone-600">© 2024 PebbleShare. All rights reserved.</div>
            <div className="flex gap-6 text-sm text-stone-600">
              <a href="#" className="hover:text-stone-900 transition-colors">Privacy</a>
              <a href="#" className="hover:text-stone-900 transition-colors">Terms</a>
              <a href="#" className="hover:text-stone-900 transition-colors">Docs</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
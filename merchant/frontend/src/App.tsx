import OnboardForm from './components/OnboardForm'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-slate-900">
          Aaroh
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Become compliant with Agentic Commerce in seconds.
        </p>
        <OnboardForm />
      </div>
    </div>
  )
}

export default App

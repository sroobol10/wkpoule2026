'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium print:hidden"
    >
      🖨 Afdrukken
    </button>
  )
}

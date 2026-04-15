import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function ProblemChild(): JSX.Element {
  throw new Error('Test error')
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders default error UI when a child throws', () => {
    // Suppress React's console.error for the expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(
      screen.getByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()

    spy.mockRestore()
  })

  it('renders custom fallback when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ProblemChild />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Custom fallback')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()

    spy.mockRestore()
  })

  it('recovers from error when Try Again is clicked', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    let shouldThrow = true

    function ConditionalError() {
      if (shouldThrow) {
        throw new Error('Test error')
      }
      return <div>Recovered</div>
    }

    render(
      <ErrorBoundary>
        <ConditionalError />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Fix the error before clicking retry
    shouldThrow = false

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('Recovered')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()

    spy.mockRestore()
  })
})

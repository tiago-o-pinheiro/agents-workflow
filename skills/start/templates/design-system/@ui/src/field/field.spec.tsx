import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Field } from './field'

describe('Field', () => {
  it('Given a label, should name the input after it', () => {
    render(<Field label="Email" />)

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('Given typing, should keep the typed value', async () => {
    const user = userEvent.setup()
    render(<Field label="Email" />)

    await user.type(screen.getByLabelText('Email'), '::value::')

    expect(screen.getByLabelText('Email')).toHaveValue('::value::')
  })

  it('Given an error, should flag the input invalid and describe it with the message', () => {
    render(<Field label="Email" error="Enter a valid email" />)

    const input = screen.getByLabelText('Email')

    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('Enter a valid email')
  })

  it('Given no error, should not flag the input invalid', () => {
    render(<Field label="Email" />)

    expect(screen.getByLabelText('Email')).toBeValid()
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument()
  })

  it('Given the disabled prop, should disable the input', () => {
    render(<Field label="Email" disabled />)

    expect(screen.getByLabelText('Email')).toBeDisabled()
  })
})

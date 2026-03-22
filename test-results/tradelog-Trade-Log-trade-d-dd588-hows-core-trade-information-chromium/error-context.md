# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Home" [ref=e4] [cursor=pointer]:
    - /url: /
    - img [ref=e5]
    - text: Home
  - generic [ref=e8]:
    - generic [ref=e10]: PulseJournal
    - generic [ref=e11]:
      - heading "Welcome back" [level=1] [ref=e12]
      - paragraph [ref=e13]: Sign in to your trading journal
    - generic [ref=e14]:
      - generic [ref=e15]:
        - text: Email
        - textbox "you@example.com" [active] [ref=e16]
      - generic [ref=e17]:
        - text: Password
        - generic [ref=e18]:
          - textbox "••••••••" [ref=e19]
          - button [ref=e20]:
            - img [ref=e21]
      - button "Sign In" [ref=e24]
    - paragraph [ref=e25]:
      - text: Don't have an account?
      - link "Create one" [ref=e26] [cursor=pointer]:
        - /url: /signup
```
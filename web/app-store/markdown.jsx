import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from '@mantine/core';

// App descriptions are Markdown (the existing App Store renders them so, and
// authors write tables and headings for it). react-markdown builds React
// elements and ignores raw HTML, so an author's description cannot inject
// markup. Links open in a new tab: they lead out of the portal. Headings move
// down three levels, below the page title and the section headings around
// them — authors start their description with a `#` of their own.
const components = {
    h1: 'h4', h2: 'h5', h3: 'h6', h4: 'h6',
    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

export function AppDescription({ children }) {
    return (
        <Typography style={{ overflowWrap: 'anywhere' }}>
            <Markdown remarkPlugins={[remarkGfm]} components={components}>{children}</Markdown>
        </Typography>
    );
}

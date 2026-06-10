import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";

interface SecretDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SecretDialog({ open, onOpenChange }: SecretDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[850px] bg-black border-gray-800">
                <DialogHeader>
                    <DialogTitle className="text-lg font-light text-center text-gray-300">
                        Interesting discovery
                    </DialogTitle>
                    <DialogDescription className="text-center text-gray-600">
                        You found my favorite artist hidden in the constellation
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <Card className="p-6 bg-gradient-to-br from-gray-900/40 to-gray-900/60 border border-gray-800 bg-black">
                        <div className="text-center space-y-4">
                            <p className="text-xs uppercase tracking-wider text-gray-600 mb-2">
                                Secret Flag
                            </p>
                            <p className="text-sm font-mono tracking-wide text-gray-400">
                                harmonics_converge_at_the_golden_ratio_of_sound
                            </p>
                        </div>
                    </Card>
                </div>
            </DialogContent>
        </Dialog>
    );
}